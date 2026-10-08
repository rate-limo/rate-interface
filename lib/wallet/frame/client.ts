"use client";

/**
 * The app's handle on the wallet frame.
 *
 * One hidden iframe, created on first use and kept for the life of the page,
 * pointed at `<walletOrigin>/wallet-frame`. Every call here becomes one
 * `postMessage` request and resolves on the matching response. Nothing here
 * ever sees a key: `unlock` sends PRF bytes IN and the caller zeroes them,
 * `request` gets a signature or a hash OUT.
 *
 * ## Imperative, not a component
 *
 * The connector needs the frame before React has mounted anything —
 * `reconnect` runs in the first effect — so the iframe is appended to
 * `document.body` by this module rather than rendered by a component that
 * might or might not be in the tree yet. A single instance is the point; two
 * frames would be two views of the same storage racing each other.
 *
 * ## Readiness has a timeout; requests do not
 *
 * The frame announces `ready` when its script runs. If that never arrives —
 * the wallet origin is down, misconfigured, blocked by an extension — the
 * caller gets an error naming the frame within `READY_TIMEOUT_MS`, rather
 * than a connect button that spins forever. A signature request, once the
 * frame is up, waits as long as the chain does; a broadcast can legitimately
 * take a while and a timer that gave up would orphan a transaction the frame
 * has already sent.
 *
 * ## Only the frame's own window is believed
 *
 * `event.source === iframe.contentWindow && event.origin === walletOrigin()`.
 * A response that fails either test is dropped. The id is a random UUID, so
 * a sender that passed both checks still could not resolve a request it did
 * not see.
 */

import { FRAME_PATH, isIsolated, walletOrigin } from "./origins";
import {
  isEventEnvelope,
  isResponseEnvelope,
  request as makeRequest,
  WalletFrameError,
  type RequestParams,
  type StatusResult,
  type WalletRpc,
} from "./protocol";
import type { Address, Hex } from "viem";

const READY_TIMEOUT_MS = 10_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export interface WalletFrame {
  status(): Promise<StatusResult>;
  resume(): Promise<Address>;
  unlock(prfOutput: Uint8Array): Promise<Address>;
  request(chainId: number, rpc: WalletRpc): Promise<Hex>;
  disconnect(): Promise<void>;
}

class WalletFrameClient implements WalletFrame {
  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<Window> | null = null;
  private readonly pending = new Map<string, Pending>();
  private warned = false;
  /** Whether `onMessage` is attached. See the note on the listener. */
  private listening = false;
  /** The origin every message is checked against, resolved when the frame is built. */
  private origin = "";
  /** The in-flight readiness handshake, if the frame has not announced itself yet. */
  private awaitingReady: { resolve: (target: Window) => void; timer: number } | null = null;

  /**
   * The ONE message listener, attached once for the life of the client.
   *
   * It used to be created inside the readiness promise, which leaked on the
   * path that is most likely to repeat. `ensure()` memoises through `ready`, so
   * the happy path attaches once — but the READY TIMEOUT clears `ready`, drops
   * the iframe and leaves its listener on `window`. Every retry after a wallet
   * origin that is down, misconfigured or blocked by an extension then added
   * another, each one holding its closure over a removed iframe, and each still
   * firing: the guard reads `this.frame`, which by then is the NEW frame, so a
   * stale listener happily processed live responses alongside the real one.
   *
   * Hoisting it makes the count one, whatever happens to the frame.
   *
   * The three checks are unchanged and are the security boundary: the message
   * must come from the wallet origin AND from this frame's own window, and an
   * id is a random UUID, so a sender passing both could still not resolve a
   * request it did not make.
   */
  private readonly onMessage = (e: MessageEvent) => {
    if (e.origin !== this.origin || !this.frame || e.source !== this.frame.contentWindow) return;

    if (isEventEnvelope(e.data)) {
      const waiting = this.awaitingReady;
      if (e.data.data.event === "ready" && waiting) {
        this.awaitingReady = null;
        window.clearTimeout(waiting.timer);
        waiting.resolve(this.frame.contentWindow as Window);
      }
      return;
    }

    if (isResponseEnvelope(e.data)) {
      const waiting = this.pending.get(e.data.id);
      if (!waiting) return;
      this.pending.delete(e.data.id);
      if (e.data.error) waiting.reject(new WalletFrameError(e.data.error));
      else waiting.resolve(e.data.result);
    }
  };

  /**
   * Reject everything in flight, because the frame that would have answered is
   * gone.
   *
   * A request deliberately carries NO timeout — a signature waits as long as
   * the chain does, and a timer that gave up would orphan a transaction the
   * frame has already broadcast. That reasoning holds only while the frame is
   * alive. Once it has been torn down nothing can ever settle these, so without
   * this the map keeps an entry per abandoned request, each pinning a resolve
   * and a reject closure, and the caller waits on a promise with no answer
   * coming.
   */
  private failPending(reason: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(reason);
    this.pending.clear();
  }

  private ensure(): Promise<Window> {
    if (this.ready) return this.ready;
    if (typeof document === "undefined") {
      return Promise.reject(new Error("The wallet frame needs a document."));
    }

    const origin = walletOrigin();
    this.origin = origin;
    if (!isIsolated() && process.env.NODE_ENV === "production" && !this.warned) {
      this.warned = true;
      // Loud on purpose. Same-origin is the local-development shape; a
      // production build in it has shipped without the boundary this whole
      // module exists for. See lib/wallet/frame/origins.ts.
      console.error(
        "[wallet] NEXT_PUBLIC_WALLET_ORIGIN is unset: the wallet frame is same-origin and its storage is readable by this page.",
      );
    }

    // Before the frame exists, so a frame that boots faster than this runs still
    // announces readiness to someone. Idempotent: at most one listener ever.
    if (!this.listening) {
      this.listening = true;
      window.addEventListener("message", this.onMessage);
    }

    this.ready = new Promise<Window>((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("tabindex", "-1");
      frame.title = "Rate wallet";
      // Hidden by size, not `display:none`: some browsers throttle or defer
      // script in a display-none frame, and this one has to answer promptly.
      frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;";
      this.frame = frame;

      const timer = window.setTimeout(() => {
        if (!this.awaitingReady) return;
        this.awaitingReady = null;
        this.ready = null;
        frame.remove();
        this.frame = null;
        const dead = new Error(`The wallet frame at ${origin} did not answer.`);
        // The frame that would have answered them has just been removed.
        this.failPending(dead);
        reject(dead);
      }, READY_TIMEOUT_MS);
      this.awaitingReady = { resolve, timer };

      frame.src = `${origin}${FRAME_PATH}`;
      document.body.appendChild(frame);
    });

    return this.ready;
  }

  private async call<T>(method: "status" | "resume" | "unlock" | "request" | "disconnect", params?: unknown): Promise<T> {
    const target = await this.ensure();
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage(makeRequest(id, method, params), walletOrigin());
    });
  }

  status(): Promise<StatusResult> {
    return this.call<StatusResult>("status");
  }

  async resume(): Promise<Address> {
    const { address } = await this.call<{ address: Address }>("resume");
    return address;
  }

  async unlock(prfOutput: Uint8Array): Promise<Address> {
    // The bytes cross by structured clone — a COPY. The caller zeroes its
    // original; the frame zeroes the copy once it has derived and wrapped it.
    const { address } = await this.call<{ address: Address }>("unlock", { prfOutput });
    return address;
  }

  request(chainId: number, rpc: WalletRpc): Promise<Hex> {
    const params: RequestParams = { chainId, rpc };
    return this.call<Hex>("request", params);
  }

  async disconnect(): Promise<void> {
    await this.call("disconnect");
  }
}

/** The one frame. */
export const walletFrame: WalletFrame = new WalletFrameClient();
