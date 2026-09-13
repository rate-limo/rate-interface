import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { LiquidityFlow } from "@/components/Liquidity/LiquidityFlow";
import { getLiquidityOverview } from "@/lib/liquidity/poolStats";
import { Metadata } from "next";
import { Toaster } from "sonner";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import * as motion from "motion/react-client";

/**
 * Pool · provide & launch — the doing surface.
 *
 * Moved here from `/pool` on 2026-07-29 so the bare route could become the
 * overview, matching Trade's Basic/Pro split: the plain route reads, the deeper
 * one acts.
 *
 * Accepts `base`/`quote` so a row on the overview can deep-link into the flow
 * with its pair already chosen. LiquidityFlow doesn't consume them yet — see the
 * note where they're read.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string; base?: string; quote?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("pool", await searchParams);
  const networkName = supportedNetworkName(network);
  return {
    title: `New position | Iter ${networkName}`,
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
            {/* The overview already builds /pool/new?base=&quote= links, so the
                params arrive today; LiquidityFlow keeps its own pair state and
                doesn't read them yet. Pre-filling from the query is the next step
                and belongs in LiquidityFlow, not here. */}
            <LiquidityFlow
              networkSlug={network}
              /* Real unlisted markets, read server-side. The flow itself is
                 still mock-driven, so this is matched by SYMBOL — a mock-only
                 token matches nothing and shows no banner, which is correct
                 (there is no such market to warn about). See lib/liquidity/unlisted.ts. */
              unlistedMarkets={unlisted}
              thresholdUsd={thresholdUsd}
            />
          </motion.div>
        </div>
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              background: "var(--m-surface)",
              border: "1px solid var(--m-border)",
              color: "var(--m-text-primary)",
            },
          }}
        />
      </AppShell>
    </MarketPageProvider>
  );
}
