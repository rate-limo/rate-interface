import { AppToaster } from "@/components/Shell/AppToaster";
import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { LiquidityFlow } from "@/components/Liquidity/LiquidityFlow";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { getLiquidityOverview } from "@/lib/liquidity/poolStats";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";

interface PageProps {
  searchParams: Promise<{
    chain?: string;
    base?: string;
    quote?: string;
    /** Both set by the token profile's LP tab — see `ActionDock`'s `lpHref`. */
    shape?: string;
    amount?: string;
    one?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("pool", await searchParams);
  return {
    title: `Deposit liquidity | Rate ${supportedNetworkName(network)}`,
    description: "Deposit liquidity into an existing Rate market.",
  };
}

export default async function PoolDeposit({ searchParams }: PageProps) {
  const params = await searchParams;
  const network = readDisplaySlug("pool", params);
  const networkName = supportedNetworkName(network);
  const { launches, thresholdUsd } = await getLiquidityOverview(networkName);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <LiquidityFlow
          networkSlug={network}
          // No "ETH"/"USDC" fallback here: the flow derives the chain's own
          // default pair when a link carries none. Arc has no ETH.
          initialBase={params.base}
          initialQuote={params.quote}
          initialShape={params.shape}
          initialAmount={params.amount}
          initialOne={params.one}
          depositOnly
          unlistedMarkets={launches.map((position) => ({
            symbol: position.symbol,
            baseSymbol: position.baseSymbol,
            quoteSymbol: position.quoteSymbol,
            quoteTvlUsd: position.quoteTvlUsd,
          }))}
          thresholdUsd={thresholdUsd}
        />
        {/* ConfirmFlow reports EVERY refusal — a shortfall, a rejected approval,
            a reverted deposit — as a toast, and this page mounted no Toaster, so
            on the deposit surface all of them rendered nothing. /pool/new has
            had one all along; same props, same corner. */}
        <AppToaster />
      </AppShell>
    </MarketPageProvider>
  );
}
