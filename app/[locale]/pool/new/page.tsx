import { AppToaster } from "@/components/Shell/AppToaster";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { LiquidityFlow } from "@/components/Liquidity/LiquidityFlow";
import { getLiquidityOverview } from "@/lib/liquidity/poolStats";
import { Metadata } from "next";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { modeFromParam } from "@/lib/liquidity/flowUrl";
import * as motion from "motion/react-client";

/**
 * Pool · provide & launch — the doing surface.
 *
 * Moved here from `/pool` on 2026-07-29 so the bare route could become the
 * overview, matching Trade's Basic/Pro split: the plain route reads, the deeper
 * one acts.
 *
 * Accepts `base`/`quote` so a row on the overview can deep-link into the flow
 * with its pair already chosen, and `mode=launch` so "Launch a pool" has an
 * address of its own. The flow writes all three back as they change.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string; base?: string; quote?: string; mode?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("pool", await searchParams);
  const networkName = supportedNetworkName(network);
  return {
    title: `New position | Rate ${networkName}`,
    description: `Provide concentrated liquidity and launch pools on ${networkName}. Pick a pair and fee, set your range on the v3-style chart, then approve and confirm.`,
  };
}

export default async function PoolNew({ searchParams }: PageProps) {
  const sp = await searchParams;
  const network = readDisplaySlug("pool", sp);
  const networkName = supportedNetworkName(network);

  // Resolves to a zero-state rather than throwing when the indexer is
  // unreachable — the provide flow must still open, it just cannot warn.
  const { launches, thresholdUsd } = await getLiquidityOverview(networkName);
  const unlisted = launches.map((p) => ({
    symbol: p.symbol,
    baseSymbol: p.baseSymbol,
    quoteSymbol: p.quoteSymbol,
    quoteTvlUsd: p.quoteTvlUsd,
  }));

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="pool-new-page"
            className="w-full"
          >
            {/* The pair was read here and dropped for months: every "Provide" row
                on the overview links /pool/new?base=&quote=, and the flow opened
                on the chain's default pair under that address. A symbol this
                chain does not list still falls back — the flow heals it and
                corrects the URL to match. */}
            <LiquidityFlow
              networkSlug={network}
              initialBase={sp.base}
              initialQuote={sp.quote}
              initialMode={modeFromParam(sp.mode)}
              /* Real unlisted markets, read server-side. The flow itself is
                 still mock-driven, so this is matched by SYMBOL — a mock-only
                 token matches nothing and shows no banner, which is correct
                 (there is no such market to warn about). See lib/liquidity/unlisted.ts. */
              unlistedMarkets={unlisted}
              thresholdUsd={thresholdUsd}
            />
          </motion.div>
        </div>
        <AppToaster />
      </AppShell>
    </MarketPageProvider>
  );
}
