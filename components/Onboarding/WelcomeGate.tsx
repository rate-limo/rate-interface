"use client";

/**
 * Client gate around the onboarding flow.
 *
 * Three states the page must tell apart, because they look identical to a naive
 * check and route to different places:
 *
 *  - **Privy still rehydrating** — render nothing. Treating this as "signed
 *    out" bounces an already-connected user to the landing page on every reload.
 *  - **Signed out** — send them home. `/welcome` has nothing to say to someone
 *    with no wallet, and the address is what the referral code is derived from.
 *  - **Already onboarded** — send them to the app. Reaching this URL again (a
 *    bookmark, a back button) must not re-run a completed flow.
 *
 * The code is fetched from admin-service rather than derived here so the client
 * and server never disagree about what a wallet's code is — and so an
 * operator-assigned vanity code wins, which a client-side derivation could not
 * know about.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletAccount } from "@/lib/wallet";
import { hasOnboarded } from "@/lib/onboarding/store";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { WelcomeFlow } from "./WelcomeFlow";

export function WelcomeGate({ networkSlug }: { networkSlug?: string }) {
  const router = useRouter();
  const { address, isConnected, isLoading } = useWalletAccount();
  const [code, setCode] = useState<string | null>(null);
  /** The code that referred this wallet, if any — undefined until known. */
  const [referrer, setReferrer] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (isLoading) return;
    if (!isConnected || !address) {
      router.replace("/");
      return;
    }
    if (hasOnboarded(address)) {
      router.replace(buildPageUrl("explore", { slug: networkSlug }));
    }
  }, [isLoading, isConnected, address, router, networkSlug]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    void fetch(`/wallet/known/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { referrerCode?: string | null } | null) => {
        // null, not undefined, on failure: "we could not find out" and "nobody
        // referred them" both mean the flow must ask rather than stall.
        if (live) setReferrer(d?.referrerCode ?? null);
      })
      .catch(() => live && setReferrer(null));

    void fetch(`/referral/code/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { code?: string } | null) => {
        if (live && d?.code) setCode(d.code);
      })
      .catch(() => {
        // The service is unreachable. Render nothing rather than a wrong code:
        // a code shown here gets copied and shared, so a placeholder would send
        // real traffic to a referral that credits nobody.
      });
    return () => {
      live = false;
    };
  }, [address]);

  if (isLoading || !isConnected || !address) return null;
  if (hasOnboarded(address)) return null;
  // Render nothing until the referrer is known: the answer decides whether the
  // flow is three screens or four, and a flow that changes length underneath
  // the user mid-step is worse than a moment of nothing.
  if (referrer === undefined) return null;

  return (
    <WelcomeFlow
      networkSlug={networkSlug}
      code={code ?? ""}
      referrer={referrer}
    />
  );
}
