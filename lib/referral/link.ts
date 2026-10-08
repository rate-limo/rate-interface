/**
 * Where a referral code is shared, and how a wallet gets one.
 *
 * `rate.limo/r/CODE` was written out by hand in WelcomeFlow, ReferralPanel and
 * the mocks. A fourth copy is how the landing page and the onboarding flow end
 * up disagreeing about the share domain, so it lives here once.
 *
 * The host is deliberately hardcoded rather than read from `location`: this
 * string is copied and pasted into someone else's chat window, so a link minted
 * on a preview deployment or on localhost must still point at production.
 */

const SHARE_HOST = "rate.limo";

/**
 * The waitlist's own host, since 2026-08-06.
 *
 * The waitlist is a separate Next.js app deployed to this subdomain, so its
 * links no longer carry a `/waitlist` segment — the host does. `rate.limo`
 * redirects `/waitlist/*` here (307) so links shared before the split still
 * land, but nothing mints that form any more.
 *
 * **This constant is duplicated in apps/waitlist.** The split copies rather
 * than shares, so both apps hand out invite links and both must agree;
 * `apps/waitlist/lib/referral/inviteUrlParity.test.ts` fails if they drift.
 */
const WAITLIST_HOST = "waitlist.rate.limo";

/** Display form — no scheme, because it is read before it is clicked. */
export function referralLink(code: string): string {
  return `${SHARE_HOST}/r/${code.trim().toUpperCase()}`;
}

/** What actually goes on the clipboard. */
export function referralUrl(code: string): string {
  return `https://${referralLink(code)}`;
}

/**
 * The **waitlist** invite link — `waitlist.rate.limo/r/CODE`.
 *
 * A separate destination from `/r/CODE`, because the two links invite people to
 * different things. `/r/CODE` lands on `InviteView` inside the app shell and asks
 * the visitor to connect a wallet: correct for an app referral, wrong for a
 * waitlist invite, where the recipient has been asked to *join a list* and the
 * next action is signing in with X. Sending waitlist invitees there made the
 * waitlist something they had to go and find for themselves.
 *
 * The code space is the same — one wallet, one referral code, shared by both — so
 * only the landing page differs.
 *
 * **The host changed on 2026-08-06 and so did the path shape.** This was
 * `rate.limo/waitlist/r/CODE` until the waitlist became its own app; it is now a
 * different host AND one segment shorter. Both halves matter to the parity
 * check, which is why that test compares the whole string rather than a host.
 */
export function waitlistInviteLink(code: string): string {
  return `${WAITLIST_HOST}/r/${code.trim().toUpperCase()}`;
}

/** What actually goes on the clipboard for a waitlist invite. */
export function waitlistInviteUrl(code: string): string {
  return `https://${waitlistInviteLink(code)}`;
}

/**
 * **The destination every shared link points at right now.** Use this, not the
 * two pairs above, anywhere the app hands a link to a user.
 *
 * Rate is pre-launch: the waitlist is the only thing anyone can actually join, so
 * a link to the app invites someone to a product they cannot use yet and asks
 * them for a wallet on arrival. Every sharing surface therefore points at the
 * waitlist door — the rewards panel, the onboarding flow, the landing page's join
 * button and the waitlist rail alike.
 *
 * **At launch, change these two bodies to `referralLink`/`referralUrl`.** That is
 * the whole migration: one edit, four surfaces, because nothing else names a
 * destination. Writing the URL out at the call site is what produced a rewards
 * panel still advertising `/r/` after this file had moved on — see the note at
 * the top about the fourth copy.
 *
 * `referralLink`/`referralUrl` stay exported because `/r/CODE` is still a live
 * route and still the right answer for an app referral; they are just not what a
 * sharing surface should reach for today.
 */
export function inviteLink(code: string): string {
  return waitlistInviteLink(code);
}

/** What goes on the clipboard. See {@link inviteLink}. */
export function inviteUrl(code: string): string {
  return waitlistInviteUrl(code);
}

export interface CodeResponse {
  code: string;
  /** False once an operator has assigned a vanity code to this wallet. */
  derived: boolean;
}

/**
 * The wallet's referral code, minted on first ask.
 *
 * `GET /referral/code/:address` is a read that also REGISTERS — admin-service
 * writes the derived code into `referralCodes` the first time a wallet asks, so
 * the link resolves the moment it is handed out. Fetching it here is what turns
 * "you're on the list" into something shareable; without the call the code
 * exists mathematically but resolves to nothing.
 *
 * Same-origin: `next.config.ts` rewrites `/referral/*` to admin-service, so the
 * service host never reaches the client bundle.
 *
 * Throws rather than returning null, so a caller has to decide what a failure
 * looks like — the landing page keeps the join itself successful and simply
 * shows no code.
 */
export async function fetchReferralCode(address: string): Promise<CodeResponse> {
  const res = await fetch(`/referral/code/${address.trim().toLowerCase()}`);
  if (!res.ok) throw new Error(`referral code lookup failed: ${res.status}`);
  const body = (await res.json()) as Partial<CodeResponse>;
  if (!body.code) throw new Error("referral code lookup returned no code");
  return { code: body.code, derived: body.derived !== false };
}
