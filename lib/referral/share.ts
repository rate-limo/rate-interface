/**
 * What a shared referral link carries — the url, the card, and the post text.
 *
 * The LINK comes from `lib/referral/link`, which owns the share host: it is
 * production's even on localhost or a preview, because it is pasted into
 * someone else's chat. The CARD is fetched from the current origin, since the
 * sheet previews it before any deploy has it.
 */

import { referralLink, referralUrl } from "./link";

/**
 * `/r/CODE` — the APP referral landing, whose OG tags carry the card.
 *
 * Deliberately `referralUrl`, not `inviteUrl`: this sheet shares the link the
 * Referrals tab shows, and the card below is that page's own preview. The
 * waitlist door `inviteUrl` points at renders a different page with no card.
 */
export function referralShareUrl(code: string): string {
  return referralUrl(code);
}

/** The same link in display form (no scheme), as printed on the card itself. */
export function referralShareLink(code: string): string {
  return referralLink(code);
}

/**
 * The 1200×630 card, from the same route `/r/CODE`'s metadata hands crawlers, so
 * the share sheet's preview is the image an unfurl will actually show.
 */
export function referralCardUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/api/og/referral?code=${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function referralShareText(code: string): string {
  return `Join me on Rate with my invite code ${code.trim().toUpperCase()}`;
}
