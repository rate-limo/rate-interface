"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { chainIds, networkNameToSlug } from "@/consts";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";
import { getBasePairs } from "@/queries/server/pairs";
import { currentMarketSymbolFromPath, resolveSwitchTarget } from "@/lib/multichain/switchLanding";
import { setSourceChainOnUrl } from "@/lib/routing/chainParams";

/**
 * `switchTo(networkName)`: checks whether the market the trader is currently viewing is
 * listed on the target chain (a targeted, cached per-network query), resolves the landing
 * route via the pure `resolveSwitchTarget`, updates the market-page context's display
 * network state, and navigates there. Never lands on a 404 / empty book — an unlisted
 * market falls back to the target chain's default markets route.
 */
export function useChainSwitch() {
  const router = useRouter();
  // The OPTIONAL context, not the throwing one.
  //
  // SwapCard calls this unconditionally, and SwapCard also renders on the
  // landing page — which mounts no MarketPageProvider, because it has no chain
  // to be on. The throwing hook took the whole page down with a 500 (and with
  // it the e2e webServer healthcheck, which requests "/"). Same reasoning as
  // LoginRouter, which reaches for this variant so a redirect cannot take out
  // the shell.
  const market = useOptionalMarketPageContext();
  const [isSwitching, setIsSwitching] = useState(false);

  const switchTo = useCallback(
    async (networkName: string) => {
      const toSlug = networkNameToSlug[networkName];
      if (!toSlug) {
        // Unrecognized network name — nothing safe to route to.
        return;
      }

      setIsSwitching(true);
      try {
        const fromMarketSymbol = currentMarketSymbolFromPath(
          window.location.pathname,
          window.location.search,
        );

        let isListed = false;
        if (fromMarketSymbol) {
          try {
            const { pairs } = await getBasePairs(networkName, fromMarketSymbol);
            isListed = Array.isArray(pairs) && pairs.length > 0;
          } catch {
            // Listing check failed (network/parse error) — treat as not listed so
            // we fall back to the safe default route rather than guessing.
            isListed = false;
          }
        }

        const target = resolveSwitchTarget({
          fromMarketSymbol,
          toNetworkName: networkName,
          toSlug,
          isListed,
          from: { pathname: window.location.pathname, search: window.location.search },
        });

        market?.setDisplayNetworkName(networkName);
        market?.setDisplayNetworkSlug(toSlug);
        market?.setDisplayChainId(chainIds[networkName]);
        router.push(target);
      } finally {
        setIsSwitching(false);
      }
    },
    [router, market]
  );

  /**
   * `switchHere(networkName)`: change the chain WITHOUT leaving the page.
   *
   * `switchTo` above is the GLOBAL switcher's behaviour — its whole job is to
   * land the trader on the target chain's equivalent page, and when there is no
   * market to carry across it falls back to that chain's markets route. That is
   * right for the sidebar switcher and wrong for a control inside a panel: the
   * swap card's token picker was calling it, so choosing a network while
   * browsing tokens threw the user out to `/explore` mid-swap. `/trade` (Basic)
   * is never pair-bound, so `fromMarketSymbol` is always null there and the
   * fallback fired every single time.
   *
   * The chain has to reach the URL rather than only the context: `/trade` reads
   * `?chain=` on the server and passes the resolved `networkName` down to
   * `SwapCard`, which is what scopes the token list. Setting the display context
   * alone would move the switcher's label and leave the tokens on the old chain.
   *
   * `replace`, not `push`: flipping between chains to look for a token is
   * browsing, and each look should not become a back-button step.
   */
  const switchHere = useCallback(
    (networkName: string) => {
      const toSlug = networkNameToSlug[networkName];
      if (!toSlug) return;

      market?.setDisplayNetworkName(networkName);
      market?.setDisplayNetworkSlug(toSlug);
      market?.setDisplayChainId(chainIds[networkName]);

      router.replace(
        setSourceChainOnUrl(window.location.pathname, window.location.search, toSlug),
        { scroll: false },
      );
    },
    [router, market],
  );

  return { switchTo, switchHere, isSwitching };
}
