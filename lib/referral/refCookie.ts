"use client";

import { isCodeShape } from "./pending";

/**
 * The referral code, in the one place that crosses an origin.
 *
 * ## Why a cookie carries this and localStorage does not
 *
 * A code is recorded twice: in `localStorage` (`lib/referral/pending`) and in
 * this cookie. The cookie exists because the X OAuth round trip comes back into
 * a **route handler**, which cannot read localStorage.
 *
 * Since 2026-08-06 it does a second job. The waitlist moved to
 * `waitlist.rate.limo`, and `localStorage` is per-origin — so a code captured by
 * `?ref=` on `rate.limo` is invisible there, and a code captured on
 * `waitlist.rate.limo/r/CODE` is invisible to the apex onboarding that later asks
 * for it. **Both directions broke.** Scoping this cookie to `.rate.limo` fixes
 * both with one mechanism, and each origin mirrors it into its own localStorage
 * so `peekStashedCode` keeps its signature and no reader changes.
 *
 * So: **the cookie is the source of truth across origins; localStorage is a
 * per-origin cache of it.**
 *
 * ## Why widening this is safe, and why it would not be for the others
 *
 * A referral code is not a secret. It is already non-`httpOnly` by design —
 * the client keeps writing it — and it is printed on the invite link that
 * produced it. The waitlist session and the OAuth request-token cookies stay
 * host-only precisely because that argument does NOT extend to them.
 */

/** Shared by apps/web and apps/waitlist. Both write it; both read it. */
export const REF_COOKIE = "iter.ref";

/** 30 days, matching the localStorage stash's practical lifetime. */
export const REF_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** The registrable domain both apps live under. */
const SHARED_DOMAIN = "rate.limo";

/**
 * The `Domain` attribute to use from `hostname`, or null for "omit it".
 *
 * **Omitting is not a degraded mode, it is the only correct answer off
 * production.** A browser silently rejects a `Domain` the current host is not
 * under, so setting `.rate.limo` from `localhost` or a `*.vercel.app` preview
 * does not write a host-only cookie — it writes no cookie at all. The failure
 * is invisible: the code is simply never attributed.
 *
 * Dev needs no special case beyond this. Cookies are not port-scoped, so
 * `localhost:3000` and `localhost:3002` already share one jar.
 */
export function cookieDomainFor(hostname: string): string | null {
  const h = hostname.trim().toLowerCase();
  if (h === SHARED_DOMAIN || h.endsWith(`.${SHARED_DOMAIN}`)) return `.${SHARED_DOMAIN}`;
  return null;
}

/**
 * The `document.cookie` string for a code, or null if the code is malformed.
 *
 * Split from the write so it can be tested without a DOM — this repo's vitest
 * is `environment: "node"`.
 */
export function buildRefCookie(code: string, hostname: string): string | null {
  const c = code.trim().toUpperCase();
  if (!isCodeShape(c)) return null;

  const domain = cookieDomainFor(hostname);
  const parts = [
    `${REF_COOKIE}=${encodeURIComponent(c)}`,
    "path=/",
    `max-age=${REF_COOKIE_MAX_AGE_SEC}`,
    "samesite=lax",
  ];
  // `secure` rides with the domain rather than being unconditional: the only
  // hosts that get a Domain are rate.limo ones, which are always https, while
  // adding it on http://localhost would silently drop the cookie in dev — the
  // same invisible failure this function exists to avoid.
  if (domain) parts.push(`domain=${domain}`, "secure");
  return parts.join("; ");
}

/** Write the code where a route handler and the other origin can both see it. */
export function writeRefCookie(code: string): void {
  if (typeof document === "undefined") return;
  const value = buildRefCookie(code, window.location.hostname);
  if (value) document.cookie = value;
}

/**
 * Pull the code out of a raw `document.cookie` string.
 *
 * Validated on the way out as well as in: this value reaches a URL path and a
 * signed message, and a cookie is user-editable.
 */
export function readRefCookie(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName.trim() !== REF_COOKIE) continue;
    let value: string;
    try {
      value = decodeURIComponent(rest.join("=").trim());
    } catch {
      // A hand-edited cookie with a stray % is malformed, not a code.
      return null;
    }
    const c = value.trim().toUpperCase();
    return isCodeShape(c) ? c : null;
  }
  return null;
}

/**
 * What the localStorage stash should become, or null to leave it alone.
 *
 * **A non-empty stash always wins.** The cookie outlives the stash (30 days,
 * and it survives a localStorage clear), so a stale cookie must never overwrite
 * a code the visitor just arrived with — that would credit the wrong referrer,
 * which is worse than crediting none.
 */
export function stashFromCookie(
  stashed: string | null,
  fromCookie: string | null,
): string | null {
  if (stashed) return null;
  return fromCookie;
}
