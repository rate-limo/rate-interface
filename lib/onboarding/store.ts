"use client";

/**
 * Which wallets have been through onboarding, and which have merely been SENT
 * there. Two states, deliberately — one boolean cannot express both.
 *
 * ## Why "offered" exists at all
 *
 * `LoginRouter` redirects a freshly-connected wallet to /welcome. Between
 * 2026-08-05 and 2026-08-08 the only thing that stopped it repeating was
 * `iter.onboarded`, which is written *solely* by WelcomeFlow's finish and skip
 * handlers. So a user who was redirected and then navigated away instead of
 * completing the flow had nothing recorded — and since a wallet reconnects
 * itself on load, the redirect fired again on the next page, and the next.
 * Connecting a wallet had become a navigation, permanently.
 *
 * `iter.onboarding-offered` is written at the moment of the redirect, before
 * the user can do anything about it. That is what makes the offer **once per
 * wallet per browser** regardless of how the flow ends — completed, skipped, or
 * abandoned by closing the tab. It is the state the old implementation could not
 * express, and its absence was the whole bug. `claimOnboardingOffer` is the only
 * way to write it, and it doubles as the gate — see its note for why.
 *
 * ## Why they stay separate
 *
 * "Was shown the door" and "walked through it" answer to different callers.
 * `LoginRouter` must not re-offer (read `wasOnboardingOffered`), while
 * `WelcomeGate` must still render the flow for someone who reloads mid-way or
 * types the URL (read `hasOnboarded`). Collapse them and one of those two
 * breaks: either the redirect repeats, or a user who refreshes on step two is
 * bounced out of a flow they were in the middle of.
 *
 * Keyed by ADDRESS, not by a single boolean: a browser with two wallets should
 * onboard each once, and a shared machine should not silently skip the second
 * person. localStorage is the right store precisely because it is per-browser —
 * a server-side flag would make "seen" follow a user across devices, and the
 * screens are worth showing again on a device where the code was never copied.
 *
 * Both keys have a row in `/cookies`. Add a key here, add a row there.
 */

/** Wallets that finished or skipped the flow. Written by WelcomeFlow. */
const DONE_KEY = "iter.onboarded";
/** Wallets that were routed to the flow, however it ended. Claimed by LoginRouter. */
const OFFERED_KEY = "iter.onboarding-offered";

/** An unbounded array in localStorage grows forever on a long-lived browser. */
const MAX_ENTRIES = 50;

function read(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Private mode, disabled storage, corrupt value. "Nobody has been
    // onboarded" is the safe reading: showing the flow twice is a small cost,
    // never showing it is a silent one.
    return [];
  }
}

function includes(key: string, address: string | undefined): boolean {
  if (!address) return false;
  return read(key).includes(address.toLowerCase());
}

function add(key: string, address: string | undefined): void {
  if (!address || typeof window === "undefined") return;
  const next = new Set(read(key));
  next.add(address.toLowerCase());
  try {
    window.localStorage.setItem(key, JSON.stringify([...next].slice(-MAX_ENTRIES)));
  } catch {
    // Unwritable storage means the flow may show again next visit. Annoying,
    // and strictly better than throwing inside a completion handler — or, for
    // the offered flag, inside a render effect.
  }
}

/** Whether this wallet has completed (or skipped) onboarding in this browser. */
export function hasOnboarded(address: string | undefined): boolean {
  return includes(DONE_KEY, address);
}

/** Record that this wallet is done. Called by both Finish and Skip. */
export function markOnboarded(address: string | undefined): void {
  add(DONE_KEY, address);
}

/**
 * Whether this wallet has already been routed to onboarding in this browser.
 *
 * Note this is deliberately NOT implied by `hasOnboarded`: the two keys are
 * written by different code at different moments, and a wallet marked done
 * without ever being auto-routed (it typed the URL) should still never be
 * auto-routed later. `wasOnboardingOffered` therefore reports the union — see
 * the callers listed in the module note.
 */
export function wasOnboardingOffered(address: string | undefined): boolean {
  return includes(OFFERED_KEY, address) || includes(DONE_KEY, address);
}

/**
 * Take the one automatic offer for this wallet, if it is still going.
 *
 * Returns true **at most once per wallet per browser**, recording the offer as
 * it does. False means it has already been taken (or there is no address).
 *
 * ## Why this is a claim and not a `mark` + a separate read
 *
 * The rule that matters is "the offer is recorded BEFORE the user can act on
 * it". A `markOnboardingOffered()` next to a `router.push()` states that rule in
 * call order only — nothing stops a later edit moving the mark into a completion
 * handler, which is exactly the bug this replaced (an abandoned flow recorded
 * nothing, so the redirect repeated forever). No unit test catches that move
 * either, because both calls still exist and both still pass their own tests.
 *
 * Making the claim the GATE removes the ordering question: a caller cannot
 * navigate without having already recorded the offer, because recording it is
 * how they learn they are allowed to navigate.
 *
 *     if (!claimOnboardingOffer(address)) return;
 *     router.push(...);
 *
 * Call it LAST, after every other guard. It is a write — asking whether the
 * offer is available spends it.
 */
export function claimOnboardingOffer(address: string | undefined): boolean {
  if (!address) return false;
  if (wasOnboardingOffered(address)) return false;
  add(OFFERED_KEY, address);
  // Unwritable storage (private mode, denied) means `add` silently did nothing,
  // so the claim cannot be made durable. Report success anyway: the alternative
  // is refusing to ever show onboarding in that browser, and the in-memory guard
  // in LoginRouter still holds for the life of the page.
  return true;
}
