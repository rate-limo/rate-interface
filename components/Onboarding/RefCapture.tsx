"use client";

/**
 * Captures `?ref=CODE` from any URL. Renders nothing.
 *
 * `/r/CODE` already works, but it is a dedicated landing page — so a sharer who
 * wants to say "look at this market" has to choose between sending the market
 * and getting the credit. This lets any URL carry attribution
 * (`/explore?ref=MEHDI`, `/trade/pro?base=NOVA&ref=MEHDI`) with no change to the
 * page at all.
 *
 * ## It used to render a banner. It does not any more (2026-08-15, user request)
 *
 * "You were invited with CODE — it'll be applied when you connect a wallet" floated
 * at the top of every page for anyone arriving with a code. Removed on request. Only
 * the RENDER is gone: the capture, the cookie mirror and the stash are untouched, so
 * a referral still resolves and still arrives pre-filled in onboarding's invite step.
 * Deleting the component instead would have quietly dropped attribution for every
 * `?ref=` link, which is the opposite of what was asked for.
 *
 * The consequence worth naming: a visitor now gets no acknowledgement that a code was
 * captured until they reach the invite step. That was the banner's actual job. If it
 * needs saying again, say it there rather than re-adding a floating bar.
 *
 * ## It stashes, it does not apply
 *
 * Applying needs a wallet signature, and prompting for one the moment someone
 * follows a link — before they know what Rate is — is how a referral link
 * becomes a bounce. The code waits in localStorage and arrives pre-filled in
 * onboarding's invite step, where the user has context and is already being
 * asked. So this adds a capture point, not a second attribution path: there is
 * still exactly one way a referral is written, and it requires a signature.
 *
 * Mounted once in AppShell, beside LoginRouter — which is what carries a
 * connected wallet into the invite step where a stashed code is consumed. Note
 * that redirect now fires only ONCE per wallet per browser, so a code stashed
 * after that single offer has been spent waits in localStorage until the user
 * reaches /welcome themselves. `/r/CODE` is unaffected either way: `InviteView`
 * applies directly and never depends on the redirect.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { codeFromQuery, peekStashedCode, stashCode } from "@/lib/referral/pending";
import { readRefCookie, stashFromCookie, writeRefCookie } from "@/lib/referral/refCookie";

export function RefCapture(): null {
  const params = useSearchParams();

  useEffect(() => {
    if (!params) return;
    const code = codeFromQuery(params);
    if (!code) return;
    stashCode(code);

    // The X OAuth round trip leaves the site and comes back into a route handler,
    // which cannot read localStorage. Mirror the code into a cookie so the callback
    // can attribute the signup. Not httpOnly on purpose — this is the same value
    // already sitting in localStorage, and the client needs to keep writing it.
    //
    // Since the waitlist moved to its own origin the cookie also carries the code
    // ACROSS hosts, which localStorage cannot. `writeRefCookie` owns the Domain
    // rule; writing it by hand here is how one of the two writers loses it.
    const stashed = peekStashedCode();
    if (stashed) writeRefCookie(stashed);
  }, [params]);

  // This is where a code captured on `waitlist.iter.cx` lands. That origin has its own
  // localStorage, so an invitee who joined the waitlist and later came here would arrive
  // with an empty stash and an invite step that asks what it was already told. The
  // `.iter.cx` cookie is what crosses; this mirrors it back into the stash so
  // `peekStashedCode` stays the only reader.
  //
  // Runs after the query effect above, which is what makes the ordering safe: a code in
  // the URL is stashed first, and `stashFromCookie` guards that a non-empty stash always
  // wins, so a stale cookie can never overwrite the code the visitor just arrived with.
  useEffect(() => {
    const mirrored = stashFromCookie(peekStashedCode(), readRefCookie(document.cookie));
    if (mirrored) stashCode(mirrored);
  }, []);

  return null;
}
