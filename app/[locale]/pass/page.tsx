import { AppToaster } from "@/components/Shell/AppToaster";
import { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { OgPassView } from "@/components/OgPass/OgPassView";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import * as motion from "motion/react-client";

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("pass", await searchParams);
  const networkName = supportedNetworkName(network);
  const title = `Rate | Rate ${networkName}`;
  const description =
    "Rate is an onchain orderbook and liquidity venue with self-custodial trading, passkey access, sponsored gas, and transparent execution.";

  return {
    title,
    description,
    openGraph: {
      siteName: "Rate",
      title,
      description,
      images: [{ url: "/api/og", width: 1200, height: 630, type: "image/jpeg", alt: "Rate" }],
    },
    twitter: { card: "summary_large_image", images: ["/api/og"] },
  };
}

export default async function PassPage({ searchParams }: PageProps) {
  const network = readDisplaySlug("pass", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="pass-page"
            className="w-full"
          >
            <OgPassView networkSlug={network} />
          </motion.div>
        </div>
        <AppToaster />
      </AppShell>
    </MarketPageProvider>
  );
}
