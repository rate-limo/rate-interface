"use client";

/**
 * Single shared WebSocket for the whole app (orderbook, trades, bars,
 * accounts). Replaces the per-hook sockets that used to open 3+ connections
 * per tab. Subscriptions are refcounted per topic; the socket reconnects with
 * exponential backoff + jitter and resubscribes everything; per-topic
 * sequence chains (`ps` → `s` on every batch) are verified so consumers can
 * resync from a REST snapshot after any loss.
 */

export interface WsBatch {
  t: string;
  ps: number | null;
  s: number;
  d: unknown[][];
}

export interface WsSnapshot {
  t: string;
  snapshot: true;
  s: number;
  d: unknown;
}

export interface TopicHandlers {
  onBatch?: (batch: WsBatch) => void;
  onSnapshot?: (snapshot: WsSnapshot) => void;
  /** Called on seq-gap or reconnect: consumer should refetch its snapshot. */
  onResync?: () => void;
}

interface TopicSub {
  method: string;
  params: Record<string, unknown>;
  unsubscribeMethod: string;
  unsubscribeParams: Record<string, unknown>;
  handlers: Set<TopicHandlers>;
  lastSeq: number | null;
}

const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export class SocketManager {
  private socket: WebSocket | null = null;
  private topics = new Map<string, TopicSub>();
  private attempts = 0;
  private closed = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Resyncs asked for since this manager was created — sequence gaps plus
   * reconnects, counted per topic-subscription asked to resync.
   *
   * Read-only bookkeeping, deliberately: it changes no behaviour and nothing
   * here reports it anywhere. It exists because one resync is normal and a
   * dozen a minute is a flapping replica or a gateway Redis that keeps
   * reconnecting, and today those two are indistinguishable from inside the
   * app. Whether this is surfaced — a status chip, a telemetry sink, a console
   * read while debugging — is a separate decision that should be made from what
   * the number actually says, not from a guess about how often this happens.
   */
  private resyncs = 0;

  constructor(private readonly url: string) {}

  /** How many resyncs this manager has asked its consumers for. See `resyncs`. */
  resyncCount(): number {
    return this.resyncs;
  }

  subscribe(
    topic: string,
    request: {
      method: string;
      params: Record<string, unknown>;
      unsubscribeMethod: string;
      unsubscribeParams?: Record<string, unknown>;
    },
    handlers: TopicHandlers,
  ): () => void {
    let sub = this.topics.get(topic);
    if (!sub) {
      sub = {
        method: request.method,
        params: request.params,
        unsubscribeMethod: request.unsubscribeMethod,
        unsubscribeParams: request.unsubscribeParams ?? request.params,
        handlers: new Set(),
        lastSeq: null,
      };
      this.topics.set(topic, sub);
      this.send({ id: topic, method: request.method, params: request.params });
    }
    sub.handlers.add(handlers);
    this.ensureConnected();

    return () => {
      const current = this.topics.get(topic);
      if (!current) return;
      current.handlers.delete(handlers);
      if (current.handlers.size === 0) {
        this.topics.delete(topic);
        this.send({
          id: topic,
          method: current.unsubscribeMethod,
          params: current.unsubscribeParams,
        });
        // Idle close: nothing left to stream, so drop the socket instead of
        // holding it open forever. ensureConnected() reopens it on the next
        // subscribe.
        if (this.topics.size === 0) {
          if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
          }
          this.socket?.close();
          this.socket = null;
          this.attempts = 0;
        }
      }
    };
  }

  destroy(): void {
    this.closed = true;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.socket?.close();
    this.socket = null;
    this.topics.clear();
  }

  private ensureConnected(): void {
    if (this.closed) return;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.connect();
  }

  private connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    // Stale-socket guard: a reconnect can orphan this exact `socket` (e.g.
    // idle-close or a fresh connect() beat it to replacing `this.socket`).
    // Every handler bails out immediately if it's not the current socket, so
    // an orphaned socket can never clobber state or double-route messages.
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempts = 0;
      // Resubscribe everything; seq chains restart, so ask consumers to resync.
      for (const [topic, sub] of this.topics) {
        sub.lastSeq = null;
        socket.send(
          JSON.stringify({ id: topic, method: sub.method, params: sub.params }),
        );
        this.resyncs += 1;
        for (const h of sub.handlers) h.onResync?.();
      }
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      let msg: unknown;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.route(msg);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.closed || this.topics.size === 0) return;
      const delay = Math.min(
        BASE_RECONNECT_MS * 2 ** this.attempts,
        MAX_RECONNECT_MS,
      );
      this.attempts++;
      this.connectTimer = setTimeout(
        () => this.connect(),
        delay + Math.random() * 500,
      );
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      socket.close();
    };
  }

  private route(msg: unknown): void {
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as Record<string, unknown>;

    if (m.method === "ping") {
      this.send({ method: "pong" });
      return;
    }
    if ("result" in m) return; // subscribe ack

    const topic = m.t as string | undefined;
    if (!topic) return;
    const sub = this.topics.get(topic);
    if (!sub) return;

    if (m.snapshot === true) {
      sub.lastSeq = m.s as number;
      for (const h of sub.handlers) h.onSnapshot?.(m as unknown as WsSnapshot);
      return;
    }

    const batch = m as unknown as WsBatch;
    const gap = sub.lastSeq !== null && batch.ps !== sub.lastSeq;
    sub.lastSeq = batch.s;
    if (gap) {
      this.resyncs += 1;
      for (const h of sub.handlers) h.onResync?.();
    }
    for (const h of sub.handlers) h.onBatch?.(batch);
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }
}

const managers = new Map<string, SocketManager>();

export function getSocketManager(url: string): SocketManager {
  let manager = managers.get(url);
  if (!manager) {
    manager = new SocketManager(url);
    managers.set(url, manager);
  }
  return manager;
}
