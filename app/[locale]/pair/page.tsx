import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { PairProfile } from "@/components/Pair/PairProfile";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { getPairBySymbol, getSpotOrderbook } from "@/queries/server";
import { getDefaultScale } from "@/queries/client/orderbook";
import type { SpotPair } from "@/types";
import type { GroupedOrderbookResult } from "@/types/tables/orderbooks/orderbook";
import type { Metadata } from "next";

/**
 * Pair profile — phase 2 of the Explore spec, finally built.
 *
 * Until now `/pair` did not exist, so every pair link in the app went to `/trade/pro`:
 * the only way to look at a market was to open the terminal for trading it. This is the
 * reading half of "read left, act right" — the acting half is the Action Dock on the
 * right rail, which is the same component Explore uses.
 *
 * Always pair-bound. A profile with no market is a 404, not an empty state, so callers
 * without base/quote should link to `/explore` instead — `buildPageUrl("pair", …)` is
 * the only construction that gets the params right.
 *
 * ## The market is resolved HERE, through the ungated detail route
 *
 * `PairProfile` used to find its own market by scanning `defaultSpotPairData.pairs` —
 * which is `/api/pairs/*`, a **listing-gated** list. Everything that links here is
 * ungated: `/api/search` is an identity lookup by design, so the search modal surfaces
 * pre-graduation markets on purpose. The intersection was a dead end — on a chain where
 * nothing is verified, EVERY pair profile reported "no market data" while the gateway's
 * own `/api/pair/symbol/:base/:quote` returned the market fine.
 *
 * So it resolves the same way `/trade/pro` does, which is why Pro always worked on the
 * markets this page could not find. `visibility.ts` keeps detail endpoints unfiltered
 * exactly so that "existing links work" — this is one of those links.
 *
 * No <main> here: AppShell renders one, and nesting two main landmarks is invalid.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string; base?: string; quote?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const network = readDisplaySlug("pair", params);
  const networkName = supportedNetworkName(network);
  const base = (params.base ?? "").toUpperCase();
  const quote = (params.quote ?? "").toUpperCase();
  const symbol = base && quote ? `${base}/${quote}` : "Market";

  const image = `/api/og/explore?kind=pool&pair=${encodeURIComponent(`${base}_${quote}`)}&network=${encodeURIComponent(networkName)}`;
  return {
    title: `${symbol} | Iter ${networkName}`,
    description: `${symbol} on Iter ${networkName} — price, spread, depth, order book, recent trades and liquidity economics for the market.`,
    openGraph: { title: `${symbol} | Iter ${networkName}`, description: `${symbol} on Iter ${networkName} — price, spread, depth, order book, recent trades and liquidity economics for the market.`, images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

/**
 * The market for `base`/`quote`, or null when there genuinely isn't one.
 *
 * Two ways to get null, and both must be null rather than a throw:
 *
 * - **The pair does not exist.** The gateway answers 404 with a body of
 *   `{"error":"Token not found"}` — and `getPairBySymbol` does not check `res.ok`, so
 *   that object arrives typed as a `SpotPair`. The `symbol` check is what turns it back
 *   into "no market"; without it the page renders a header built from `undefined`.
 * - **The indexer is unreachable**, which is its normal state on some chains. That is the
 *   empty state, not a 500.
 */
async function resolvePair(
  networkName: string,
  base: string,
  quote: string,
): Promise<SpotPair | null> {
  if (!base || !quote) return null;
  try {
    const resolved = await getPairBySymbol(networkName, base, quote);
    return resolved?.symbol ? resolved : null;
  } catch {
    return null;
  }
}

export default async function Pair({ searchParams }: PageProps) {
  const params = await searchParams;
  const network = readDisplaySlug("pair", params);
  const base = params.base ?? "";
  const quote = params.quote ?? "";

  const networkName = supportedNetworkName(network);
  const pair = await resolvePair(networkName, base, quote);

  /*
   * Seed the book on the server so the first paint has real depth rather than an
   * empty ladder that fills in a beat later. `useOrderbook` takes it as its
   * starting snapshot and maintains it over the websocket from there — the same
   * arrangement `/trade/pro` uses.
   *
   * Wrapped, unlike Pro's: `getSpotOrderbook` neither checks `res.ok` nor
   * guards against malformed JSON, so a rate-limited gateway would throw here
   * and cost the page everything — the book, the trades, the sidebar. A null
   * seed is survivable; the hook fetches its own on mount.
   */
  let step: string | null = null;
  let seed: GroupedOrderbookResult | null = null;
  if (pair) {
    step = getDefaultScale(pair.price, pair.scales);
    try {
      seed = await getSpotOrderbook(networkName, pair.base, pair.quote, step, 11, false);
    } catch {
      seed = null;
    }
  }

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <PairProfile
          base={base}
          quote={quote}
          pair={pair}
          step={step}
          seed={seed}
        />
      </AppShell>
    </MarketPageProvider>
  );
}
