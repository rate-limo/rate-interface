"use client";

/**
 * Routes a wallet connection to onboarding — ONCE, ever, per wallet per browser.
 *
 * ## The once-ever rule is the whole design
 *
 * This component existed before, was deleted on 2026-08-08, and is restored here
 * with the guard it was missing. Read this before changing any condition below.
 *
 * The old version gated on two things: the server's `onboarded` and the local
 * `iter.onboarded` flag. Neither can express "already offered":
 *
 *  - **`onboarded` is `facts.hasPoints`** (admin-service `identity.ts`), because
 *    there is no identity table to write a real flag to and a public endpoint to
 *    set one would be forgeable — forging it suppresses someone else's welcome
 *    flow, the exact harm the field exists to prevent. So it answers false for
 *    every wallet that has not *traded*, which on a testnet is nearly all of them.
 *  - **`iter.onboarded` is written only by WelcomeFlow's finish and skip
 *    handlers**, i.e. only on *completion*.
 *
 * So a user who was redirected here and navigated away instead of finishing left
 * no record at all — and a wallet reconnects itself on load, so the redirect
 * fired again on the next page, and the next. Connecting a wallet had become a
 * navigation, permanently. That was the reported bug.
 *
 * `claimOnboardingOffer` records the offer **as the act of being allowed to
 * navigate**, so it survives a user who abandons the flow, closes the tab, or
 * never scrolls — and there is no version of this component that pushes without
 * recording. `wasOnboardingOffered` reads the union of offered-and-completed, so
 * neither route back in.
 *
 * The server check stays as a SECOND guard, not the first: it is what stops a
 * cleared browser re-onboarding someone who has traded for months. The local
 * flag is what stops everything else.
 *
 * ## Mounted in AppShell ONLY
 *
 * The trigger is "connected a wallet while using the app", so the shell is
 * exactly the right boundary — every app page renders it and no marketing or
 * legal page does. It rode `app/[locale]/page.tsx` too until 2026-08-08; that
 * mount is deliberately NOT restored. The landing page renders no shell, and a
 * visitor reading the pitch with a previously-connected wallet was being thrown
 * into a signup flow they had not asked for — the most hostile version of this
 * bug. Keeping it off that page also keeps `useWalletAccount` out of the landing
 * page's own bundle.
 *
 * AppShell must render inside MarketPageProvider, but the slug is still read
 * through the OPTIONAL hook: a throwing hook here would take down the entire
 * shell over a redirect, and `buildPageUrl` already falls back to
 * DEFAULT_CHAIN_SLUG.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";
import { useWalletAccount } from "@/lib/wallet";
import { claimOnboardingOffer, wasOnboardingOffered } from "@/lib/onboarding/store";
import { buildPageUrl } from "@/lib/routing/chainParams";

export function LoginRouter() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const market = useOptionalMarketPageContext();
  const displayNetworkSlug = market?.displayNetworkSlug;
  const { address, isConnected, isLoading } = useWalletAccount();

  // Route at most once per mount. The stored flag is the durable guard; this is
  // what stops a re-render pushing a second time before the flag is read back.
  const routed = useRef(false);

  const { data } = useQuery({
    queryKey: ["wallet-known", address],
    queryFn: async () => {
      const res = await fetch(`/wallet/known/${address}`);
      if (!res.ok) return null;
      return (await res.json()) as { seen: boolean; onboarded: boolean };
    },
    // Never ask about a wallet that has already been offered the flow — that is
    // the common case after the first visit, so this also keeps the request off
    // almost every page load.
    enabled: Boolean(address) && isConnected && !wasOnboardingOffered(address),
    // The answer only changes once per wallet, ever.
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (isLoading || !isConnected || !address || routed.current) return;
    // Already on the flow, or on the invite page which applies its own code.
    // Note neither marks the wallet as offered: arriving under your own steam
    // is not the same as being sent, and must not spend the one automatic offer.
    if (pathname.includes("/welcome") || pathname.includes("/r/")) return;
    // Offered before, finished before, or both. Never again either way.
    if (wasOnboardingOffered(address)) return;
    // `undefined` is "still asking" and `null` is "the lookup failed". Neither
    // is a reason to onboard — a failed lookup that routed would show the flow
    // to every returning user whenever admin-service is down. It is also not a
    // reason to burn the offer, so nothing is recorded on this path.
    //
    // `onboarded`, not `seen`: an invited wallet is seen but has not onboarded,
    // and it is precisely that user who needs the flow (and their own code).
    if (data?.onboarded !== false) return;

    // LAST, after every other guard: claiming is a WRITE, and the claim is what
    // records the offer. There is deliberately no way to navigate without having
    // recorded it first — that ordering was the bug, so it is not left to call
    // order here. Every `return` above this line leaves the offer unspent.
    //
    // HOME, not `/welcome`. The four-step flow was replaced by `GetStartedCard`,
    // which lives on Home and derives its progress from a balance and a trade
    // count rather than from a wizard the user has to finish. So a first-time
    // wallet is taken to the page that carries the card instead of to a page
    // that carried a redirect out of it. `/welcome` still exists and is still
    // where `/r/CODE` lands — this only stops being the thing that sends people
    // there.
    if (!claimOnboardingOffer(address)) return;
    routed.current = true;
    router.push(buildPageUrl("home", { slug: displayNetworkSlug }));
  }, [isLoading, isConnected, address, data, pathname, router, displayNetworkSlug]);

  return null;
}
