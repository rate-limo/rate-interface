import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { PositionsPage } from "@/components/Liquidity/PositionsPage";
import { Metadata } from "next";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import * as motion from "motion/react-client";

/**
 * Pool · overview — the reading surface.
 *
 * "Which pool should I even be in?" had nowhere to be answered before this:
 * `/pool` was only the three-step provide flow, which now lives at `/pool/new`.
 * Same split as Trade's Basic/Pro.
 *
 * The Rate dashboard's "View pools" button points here; it had no destination at
 * all until this page existed.
 *
 * Market-wide only. Your own positions stay in /portfolio → LP positions, which
 * remains their owner — a second positions table here would be one more thing to
 * keep in sync.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("pool", await searchParams);
  const networkName = supportedNetworkName(network);
  return {
    title: `Liquidity | Rate ${networkName}`,
    description: `Manage your active and closed Rate liquidity positions on ${networkName}.`,
  };
}

export default async function Pool({ searchParams }: PageProps) {
  const network = readDisplaySlug("pool", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="pool-page"
            className="w-full"
          >
            <PositionsPage networkSlug={network} />
          </motion.div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
