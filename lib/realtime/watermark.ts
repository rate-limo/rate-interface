/**
 * The commit watermark: "never render a REST answer older than a frame this tab
 * has already applied."
 *
 * The broker bumps a per-writer counter (`shard-0`, `shard-1`, `cron`) as the
 * last write of every transaction that publishes websocket frames, and stamps
 * it onto those frames (`w` on each batch). The gateway reads the same counters
 * BEFORE a route's own queries and returns them as `X-Commit-Watermark`. So a
 * response whose value for some writer is below one this tab has already seen
 * on a frame was read from the database before that frame's transaction
 * committed, and must not overwrite what the frame put on screen.
 *
 * That is the case the always-revalidate cache rules cannot close: a request
 * already IN FLIGHT when a frame arrives resolves afterwards with older data.
 * It also covers any cache or read replica added in front of the gateway later.
 *
 * Kept per chain, since each chain has its own database and counters. Persisted
 * to sessionStorage so a refresh keeps what the tab has seen. Absence is always
 * "unknown", never "stale": an old gateway, a non-gateway URL, or an old broker
 * simply leaves the check out.
 */
import { PonderLinks, PonderWssLinks } from "@/consts";

export type Watermark = Record<string, number>;

/** sessionStorage key. Has a row in /cookies, as every storage key must. */
export const WATERMARK_STORAGE_KEY = "iter.commit-watermark";
export const WATERMARK_HEADER = "X-Commit-Watermark";

let seen: Record<string, Watermark> | null = null;

function load(): Record<string, Watermark> {
  if (seen) return seen;
  seen = {};
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(WATERMARK_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object") {
      for (const [chain, vector] of Object.entries(parsed as Record<string, unknown>)) {
        const clean = sanitize(vector);
        if (clean) seen[chain] = clean;
      }
    }
  } catch {
    // Private windows and blocked storage: start empty, which only disables the
    // check until the first frame arrives.
  }
  return seen;
}

function save(): void {
  try {
    if (typeof sessionStorage !== "undefined" && seen) sessionStorage.setItem(WATERMARK_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Best effort: the in-memory copy still protects this page.
  }
}

function sanitize(value: unknown): Watermark | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Watermark = {};
  for (const [writer, seq] of Object.entries(value as Record<string, unknown>)) {
    if (typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0) out[writer] = seq;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The chain a gateway URL (REST or websocket) belongs to, or null for any other host. */
export function chainKeyForUrl(url: string): string | null {
  // The same-origin proxy (`/api/gateway/…?network=<name>`) names its chain in
  // the query. Relative, so `new URL(url)` alone would throw and skip the check.
  if (url.startsWith("/api/gateway/")) {
    const network = new URLSearchParams(url.split("?")[1] ?? "").get("network");
    return network && PonderLinks[network] ? network : null;
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  for (const [network, link] of [...Object.entries(PonderLinks), ...Object.entries(PonderWssLinks)]) {
    try {
      if (link && new URL(link).host === host) return network;
    } catch {
      // a malformed entry matches nothing
    }
  }
  return null;
}

/** `shard-0=812,shard-1=40` → `{ "shard-0": 812, "shard-1": 40 }`; null when absent or malformed. */
export function parseWatermark(header: string | null | undefined): Watermark | null {
  if (!header) return null;
  const out: Watermark = {};
  for (const part of header.split(",")) {
    const [writer, raw] = part.split("=");
    const seq = Number(raw);
    if (!writer || !Number.isSafeInteger(seq) || seq < 0) return null;
    out[writer.trim()] = seq;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function formatWatermarkHeader(w: Watermark): string {
  return Object.entries(w)
    .map(([writer, seq]) => `${writer}=${seq}`)
    .sort()
    .join(",");
}

/**
 * Per-writer MINIMUM of two answers merged into one: the result is only as
 * fresh as the older part. A writer present in only one counts as 0 in the
 * other. Null if either side is unknown.
 */
export function minWatermark(a: Watermark | null, b: Watermark | null): Watermark | null {
  if (!a || !b) return null;
  const out: Watermark = {};
  for (const writer of new Set([...Object.keys(a), ...Object.keys(b)])) out[writer] = Math.min(a[writer] ?? 0, b[writer] ?? 0);
  return out;
}

/** Raise the chain's watermark to at least `frame`'s, per writer. Never lowers it. */
export function noteFrameWatermark(chain: string | null, frame: unknown): void {
  const w = sanitize(frame);
  if (!chain || !w) return;
  const all = load();
  const current = all[chain] ?? {};
  let changed = false;
  for (const [writer, seq] of Object.entries(w)) {
    if (seq > (current[writer] ?? 0)) {
      current[writer] = seq;
      changed = true;
    }
  }
  if (changed) {
    all[chain] = current;
    save();
  }
}

/**
 * True when `response` predates something this tab has seen: for some writer,
 * the response's value is below the highest frame value. A writer missing from
 * the response counts as 0 (its row did not exist when the answer was read).
 */
export function isOlderThan(response: Watermark, seenVector: Watermark): boolean {
  return Object.entries(seenVector).some(([writer, seq]) => (response[writer] ?? 0) < seq);
}

export function seenWatermark(chain: string): Watermark {
  return { ...(load()[chain] ?? {}) };
}

/** For tests. */
export function resetWatermarks(): void {
  seen = {};
  behindSince.clear();
  counters.clear();
}

/**
 * How often the guarantee had to act, per chain. `retried` is an answer that
 * came back older than a frame and was re-asked; `refused` is one still older
 * after every retry (the caller kept its newer data); `healed` is a chain whose
 * answers stayed behind for HEAL_AFTER_MS, so the stored watermark was dropped.
 *
 * Retries are the design working. Refusals mean the database took longer than
 * ~1.5 s to show a committed transaction; heals mean the counters were reset
 * under the app. Both should be rare, and this is how rare is measured:
 * `reportWatermarkCounters` posts them to /api/watermark-report, which logs one
 * `[watermark]` line per tab per minute when there is anything to say.
 */
export type WatermarkCounts = { retried: number; refused: number; healed: number };
const counters = new Map<string, WatermarkCounts>();

function count(chain: string, kind: keyof WatermarkCounts): void {
  const c = counters.get(chain) ?? { retried: 0, refused: 0, healed: 0 };
  c[kind]++;
  counters.set(chain, c);
  ensureReporter();
}

export function watermarkCounters(): Record<string, WatermarkCounts> {
  return Object.fromEntries([...counters].map(([chain, c]) => [chain, { ...c }]));
}

export const WATERMARK_REPORT_PATH = "/api/watermark-report";
const REPORT_EVERY_MS = 60_000;
let reporterInstalled = false;

/** Send what has accumulated and start over. Nothing is sent when nothing happened. */
export function reportWatermarkCounters(): void {
  if (counters.size === 0 || typeof navigator === "undefined") return;
  const body = JSON.stringify({ counts: watermarkCounters() });
  counters.clear();
  try {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(WATERMARK_REPORT_PATH, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(WATERMARK_REPORT_PATH, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    }
  } catch {
    // Telemetry never costs the page anything.
  }
}

function ensureReporter(): void {
  if (reporterInstalled || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  reporterInstalled = true;
  setInterval(reportWatermarkCounters, REPORT_EVERY_MS);
  window.addEventListener("pagehide", reportWatermarkCounters);
}

export class StaleResponseError extends Error {
  constructor(url: string) {
    super(`gateway answer for ${url} is older than a live update already shown; kept the newer data`);
    this.name = "StaleResponseError";
  }
}

const RETRY_DELAYS_MS = [150, 400, 1_000];
/**
 * An in-flight race resolves in milliseconds. A chain whose answers stay behind
 * what this tab stored for longer than this has had its counters RESET (a
 * database restore or rebuild), and the stored value is what is wrong: accept
 * the server's and carry on, rather than refusing every answer until the tab
 * closes.
 */
const HEAL_AFTER_MS = 10_000;
const behindSince = new Map<string, number>();

function heal(chain: string, answered: Watermark): void {
  const all = load();
  all[chain] = { ...answered };
  save();
  behindSince.delete(chain);
}

/**
 * `fetch` for gateway REST reads. In the browser it refuses an answer older
 * than a frame already applied: it re-asks (with backoff, inside the gateway's
 * rate limit) and, if the answer is still behind, throws so the caller keeps the
 * newer data it has. On the server, and for any non-gateway URL, it is `fetch`.
 */
export async function gatewayFetch(input: string, init?: RequestInit): Promise<Response> {
  const chain = typeof window === "undefined" ? null : chainKeyForUrl(input);
  if (!chain) return fetch(input, init);
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);
    // `headers` is read defensively: a response without readable headers is
    // "unknown", the same as one without the header.
    const answered = parseWatermark(response.headers?.get?.(WATERMARK_HEADER));
    if (!answered || !isOlderThan(answered, seenWatermark(chain))) {
      behindSince.delete(chain);
      return response;
    }
    const since = behindSince.get(chain) ?? Date.now();
    behindSince.set(chain, since);
    if (Date.now() - since > HEAL_AFTER_MS) {
      heal(chain, answered);
      count(chain, "healed");
      return response;
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      count(chain, "refused");
      throw new StaleResponseError(input);
    }
    count(chain, "retried");
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
