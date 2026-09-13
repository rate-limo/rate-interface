import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { LiquidityFlow } from "@/components/Liquidity/LiquidityFlow";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { getLiquidityOverview } from "@/lib/liquidity/poolStats";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";

interface PageProps {
  searchParams: Promise<{ chain?: string; base?: string; quote?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("pool", await searchParams);
  return {
    title: `Deposit liquidity | Iter ${supportedNetworkName(network)}`,
    description: "Deposit liquidity into an existing Iter market.",
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
          initialBase={params.base ?? "ETH"}
          initialQuote={params.quote ?? "USDC"}
          depositOnly
          unlistedMarkets={launches.map((position) => ({
            symbol: position.symbol,
            baseSymbol: position.baseSymbol,
            quoteSymbol: position.quoteSymbol,
            quoteTvlUsd: position.quoteTvlUsd,
          }))}
          thresholdUsd={thresholdUsd}
        />
      </AppShell>
    </MarketPageProvider>
  );
}
