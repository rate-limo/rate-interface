import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { PortfolioView } from "@/components/Portfolio/PortfolioView";
import { sectionFromParam } from "@/components/Portfolio/section";
import { DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import * as motion from "motion/react-client";

export default async function Main({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const network = DEFAULT_CHAIN_SLUG;
  // Read server-side rather than through `useSearchParams`, which would opt this
  // page out of static rendering unless it were Suspense-wrapped.
  const initialSection = sectionFromParam((await searchParams).tab);

  // The cross-chain PortfolioView does not read the per-network provider — it
  // aggregates every chain behind the mock seam. The provider stays only because
  // the shared chrome (AppShell / FooterDesktop and their children: BrandLogo,
  // ChainSwitcher, AppSidebar, SearchModal, StatusBar) calls
  // useMarketPageContext(), which throws without it. Same wrapper every sibling
  // page uses.
  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="portfolio-page"
            className="w-full"
          >
            <PortfolioView networkSlug={network} initialSection={initialSection} />
          </motion.div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
