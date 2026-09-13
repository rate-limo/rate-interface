import { isAccessToken } from "@iter/types";

/**
 * Where the browser keeps its key to an open support thread.
 *
 * Pure functions over a Storage-like object, same shape as `lib/consent/store`,
 * so the logic is testable without a DOM.
 *
 * ## Why localStorage, and what that costs
 *
 * The token has to survive a page reload and a navigation, and it must never
 * ride along on requests the way a cookie would — it is the sole key to a
 * conversation, so the fewer systems that see it the better.
 *
 * The cost is honest and worth stating on /privacy: clearing site data, or
 * using a different browser, loses the thread. There is no recovery, because
 * recovery means proving who you are, and this feature exists precisely so
 * that someone who cannot do that can still ask for help. Losing it means
 * opening a new ticket, not losing an account.
 */

export const SUPPORT_KEY = "iter.support-ticket";

export interface SupportSession {
  /** 64 hex chars. The key to the thread. */
  token: string;
  /** Operator-facing reference, shown so the visitor can quote it. */
  reference: string;
}

export interface SupportStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The stored session, or null.
 *
 * The token is shape-validated on the way OUT as well as in: it reaches a
 * request header and, on the server, a WHERE clause. A value that has been
 * hand-edited in devtools, or left behind by an older format, is treated as
 * no session rather than passed along.
 */
export function readSession(storage: SupportStorage | null | undefined): SupportSession | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(SUPPORT_KEY);
  } catch {
    // Safari private mode, storage disabled by policy. No session is the safe
    // reading — the widget just offers to open a new ticket.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SupportSession>;
    if (!isAccessToken(parsed.token)) return null;
    if (typeof parsed.reference !== "string" || parsed.reference.length === 0) return null;
    return { token: parsed.token, reference: parsed.reference };
  } catch {
    return null;
  }
}

/** Returns false when storage refused the write, so the caller can say the
 * thread will not survive a reload instead of silently promising it will. */
export function writeSession(
  storage: SupportStorage | null | undefined,
  session: SupportSession,
): boolean {
  if (!storage) return false;
  if (!isAccessToken(session.token)) return false;
  try {
    storage.setItem(SUPPORT_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage: SupportStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(SUPPORT_KEY);
  } catch {
    /* nothing to do — the caller is closing a thread, not depending on this */
  }
}

/** `localStorage` when it exists. Server render and locked-down browsers both
 * get null, and every function above already treats that as "no session". */
export function browserStorage(): SupportStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
