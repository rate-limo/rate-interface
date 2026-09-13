import ClaimView from "@/components/Rewards/ClaimView";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import * as motion from "motion/react-client";
import { readDisplaySlug } from "@/lib/routing/chainParams";

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export default async function RewardsPage({ searchParams }: PageProps) {
  const network = readDisplaySlug("rewards", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="rewards-page"
            className="w-full"
          >
            <ClaimView networkSlug={network} />
          </motion.div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
