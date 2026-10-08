import { AppToaster } from "@/components/Shell/AppToaster";
import { HomeDesktopPage } from "@/components/Pages/Home/DesktopPage";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { Metadata } from "next";
import * as motion from "motion/react-client";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { readGraduationThreshold } from "@/lib/liquidity/threshold";

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("explore", await searchParams);
  const networkName = supportedNetworkName(network);

  return {
    title: `Crypto Exchange | The first fully onchain Exchange | Self-custody Bitcoin & Altcoin exchange in ${networkName} | Rate`,
    description: `Rate is a secure self-custodial cryptocurrency exchange that allows you to buy, sell, and trade Bitcoin, Ethereum, and 700+ altcoins. The leader in driving onchain ecnomy adoption.`,
    openGraph: {
      title: `Crypto Exchange | The first fully onchain Exchange | Self-custody Bitcoin & Altcoin exchange in ${networkName} | Rate`,
      description: `Rate is a secure self-custodial cryptocurrency exchange that allows you to buy, sell, and trade Bitcoin, Ethereum, and 700+ altcoins. The leader in driving onchain ecnomy adoption.`,
      images: [
        {
          url: "/api/og", // app/api/og/route.ts -- serves the light or dark card by time of day
          width: 1200,
          height: 630,
          type: "image/jpeg",
          alt: "Rate",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/api/og"],
    },
  };
}

export default async function Main({ searchParams }: PageProps) {
  const network = readDisplaySlug("explore", await searchParams);
  // The operator's listing threshold, read once here and handed to every surface that
  // draws progress toward it — the launch cards and the ticker. (The shelves used to be
  // a third; see ExploreShelves for why that was removed.) Two independent reads would
  // eventually disagree at exactly the moment a market graduates, which is the moment
  // anyone is looking. Same reasoning as unlistedPairs being fetched once in
  // HomeDesktopPage.
  const thresholdUsd = await readGraduationThreshold();

  return (
    <MarketPageProvider networkSlugInput={network}>
      {/* AppShell wraps ALL the width branches rather than sitting inside the
          desktop one. It used to be gated at min-[1200px], which meant mobile got
          the DesktopOnly notice with no header and no tab bar — a dead end with
          nothing to tap out of. The shell carries mobile chrome now, so the
          notice at least sits inside working navigation.
          No <main> of our own here: AppShell renders one. */}
      <AppShell>
        <div className="relative isolate min-h-full">
          {/* One page at every width. Below 1200px this used to render
              DesktopOnly ("Mobile Coming Soon"), so on a phone the Explore tab
              — one of the five in MobileTabs — was a dead end. The directory's
              tables scroll sideways inside their own overflow-x-auto. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="explore-page"
            className="w-full"
          >
            <HomeDesktopPage thresholdUsd={thresholdUsd} />
          </motion.div>
        </div>
        <AppToaster />
      </AppShell>
    </MarketPageProvider>
  );
}
