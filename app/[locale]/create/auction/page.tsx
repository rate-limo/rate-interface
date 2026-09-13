import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { AuctionFlow } from "@/components/Launch/AuctionFlow";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { Metadata } from "next";

/**
 * Create · auction — the presale flow on its own route.
 *
 * `AuctionsPanel` has linked here since it was written, and until now there was
 * no page at this path: only `/launch/white/[id]` existed, so its "create an
 * auction" call to action 404'd. The flow itself was reachable only as a tab
 * inside `/create`, which is why the missing page went unnoticed.
 *
 * The same `AuctionFlow` renders in both places. It is one component with one
 * draft store, so arriving here and arriving through the tab cannot produce two
 * different presales.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("create", await searchParams);
  const networkName = supportedNetworkName(network);
  return {
    title: `Create an auction | Iter ${networkName}`,
    description: `Open a fair-price presale on ${networkName} — one price for every buyer, pro-rata settlement, and graduation liquidity committed before the market opens.`,
  };
}

export default async function CreateAuction({ searchParams }: PageProps) {
  const network = readDisplaySlug("create", await searchParams);
  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <AuctionFlow networkSlug={network} />
      </AppShell>
    </MarketPageProvider>
  );
}
