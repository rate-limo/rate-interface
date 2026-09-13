import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { AuctionProfile } from "@/components/Launch/AuctionProfile";
import { readDisplaySlug } from "@/lib/routing/chainParams";
import { Metadata } from "next";

interface PageProps { params: Promise<{ id: string }>; searchParams: Promise<{ chain?: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Auction ${id.slice(0, 8)} | Iter`, description: "A fair-price presale that graduates into Iter's onchain orderbook." };
}

export default async function AuctionProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const network = readDisplaySlug("create", await searchParams);
  // AppShell's chrome (sidebar, status bar, mobile header) reads the market
  // context, so the provider has to sit outside it -- same as /create does.
  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell><AuctionProfile networkSlug={network} id={id} /></AppShell>
    </MarketPageProvider>
  );
}
