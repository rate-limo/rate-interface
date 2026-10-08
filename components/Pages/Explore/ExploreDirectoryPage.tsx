import { HomeDesktopPage } from "@/components/Pages/Home/DesktopPage";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { readGraduationThreshold } from "@/lib/liquidity/threshold";
import type { ExploreSection } from "@/lib/routing/chainParams";

const tabForSection = (section: ExploreSection) => section === "auctions" ? "auction" : section;

export async function ExploreDirectoryPage({ section, network }: { section: ExploreSection; network: string }) {
  const thresholdUsd = await readGraduationThreshold();
  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          {/* Every width: below 1200px this rendered NOTHING (no fallback at all),
              so /explore/tokens and friends were blank pages on a phone. */}
          <div className="w-full">
            <HomeDesktopPage thresholdUsd={thresholdUsd} initialDirectoryTab={tabForSection(section) as "tokens" | "auction" | "launches" | "pools" | "transactions"} />
          </div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
