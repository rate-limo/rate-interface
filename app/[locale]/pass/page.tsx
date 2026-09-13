import { Metadata } from "next";
import { Toaster } from "sonner";
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
  const title = `Iter | Iter ${networkName}`;
  const description =
    "Iter is an onchain orderbook and liquidity venue with self-custodial trading, passkey access, sponsored gas, and transparent execution.";

  return {
    title,
    description,
    openGraph: {
      siteName: "Iter",
      title,
      description,
      images: [{ url: "/api/og", width: 1200, height: 630, type: "image/jpeg", alt: "Iter" }],
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
