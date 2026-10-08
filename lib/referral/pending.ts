"use client";

/**
 * The referral code a visitor arrived with, held until they can sign for it.
 *
 * Two ways in, one store:
 *
 *  - `/r/CODE` — the dedicated invite landing (InviteView stashes on mount).
 *  - `?ref=CODE` on ANY page — new. A sharer who wants to say "look at this
 *    market" should not have to choose between sending the market and getting
 *    the credit.
 *
 * Both stash and both are applied by the same signature flow, so this adds a
 * capture point rather than a second attribution path — there is still exactly
 * one way a referral is written, and it requires a signature.
 *
 * ## Why stash instead of applying on arrival
 *
 * Applying needs a wallet signature. Prompting for one the moment someone
 * follows a link, before they know what Rate is, is how a referral link becomes
 * a bounce. So the code waits — through the connect round trip, through a page
 * reload — and is offered at a point where the user has context.
 */

const KEY = "iter.pending-referral";

/** The query parameter a shared link may carry. */
export const REF_PARAM = "ref";

/**
 * Codes are uppercase alphanumeric: 6 hex for derived, 3–12 for vanity. Anything
 * else is not a code and must not be stored — this value ends up in a URL path
 * and in a signed message, so it is validated on the way IN rather than trusted
 * on the way out.
 */
const CODE_SHAPE = /^[A-Z0-9]{3,12}$/;

export function isCodeShape(raw: string): boolean {
  return CODE_SHAPE.test(raw.trim().toUpperCase());
}

/** Remember a code across the connect round-trip. Rejects malformed input. */
export function stashCode(code: string): void {
  const c = code.trim().toUpperCase();
  if (!isCodeShape(c)) return;
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    /* private mode — the user can still type the code in onboarding */
  }
}

/** Read without consuming. For UI that needs to show what is pending. */
export function peekStashedCode(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && isCodeShape(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Read and consume.
 *
 * Only call this once the code has actually been APPLIED. Consuming on display
 * would lose the referral for anyone who reloads mid-flow, which is the exact
 * case the stash exists for.
 */
export function takeStashedCode(): string | null {
  const v = peekStashedCode();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do; the value is already returned */
  }
  return v;
}

/**
 * Pull a code out of a query string.
 *
 * Returns null for anything malformed rather than passing it through — a bad
 * `?ref=` should render no banner at all, not a banner naming a code that
 * cannot work.
 */
export function codeFromQuery(search: string | URLSearchParams): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get(REF_PARAM);
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return isCodeShape(c) ? c : null;
}
