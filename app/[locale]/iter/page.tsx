import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { IterDashboard } from "@/components/Iter/IterDashboard";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { readDisplaySlug } from "@/lib/routing/chainParams";
import { IterDesktopWalletButton } from "@/components/Iter/IterDesktopWalletButton";
import { getProtocolFlywheelData } from "@/lib/iter/protocolMetrics";
import * as motion from "motion/react-client";

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export const metadata: Metadata = {
  title: "Rate protocol metrics",
  description: "Protocol revenue, liquidity, and LP performance across Rate markets.",
};

export default async function IterPage({ searchParams }: PageProps) {
  const network = readDisplaySlug("iter", await searchParams);
  const flywheel = await getProtocolFlywheelData();

  return (
    <MarketPageProvider networkSlugInput={network}>
      {/* No forced `dark` here: the shell, tabs and dashboard are all
          token-driven, so the page follows the user's theme like every other
          surface. Pinning .dark on this wrapper resolved every --m-* to its
          dark value and made light mode unreachable. */}
      {/* One composition at every width. This used to be two branches — a
          desktop-gated AppShell plus a hand-rolled mobile stack — which rendered
          IterDashboard TWICE and made /iter the only page with mobile chrome.
          Both the header and the tab bar are shell-owned now, so the branch and
          the duplicate are gone. */}
      <div className="min-h-screen bg-[color:var(--m-background)] text-[color:var(--m-text-primary)]">
        <AppShell
          headerContent={
            <div className="text-sm font-semibold text-[color:var(--m-text-primary)]">Rate Protocol</div>
          }
          walletContent={<IterDesktopWalletButton />}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="iter-page"
            className="w-full"
          >
            <IterDashboard flywheel={flywheel} />
          </motion.div>
        </AppShell>
      </div>
    </MarketPageProvider>
  );
}
