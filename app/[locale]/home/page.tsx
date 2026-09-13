import type { Metadata } from "next";
import * as motion from "motion/react-client";
import { AppShell } from "@/components/Shell/AppShell";
import { SocialColumns } from "@/components/Shell/SocialColumns";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { HomeFeed } from "@/components/Social/HomeFeed";
import { DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";

/**
 * `/[locale]/home` — the social surface.
 *
 * ## It is not the landing page
 *
 * `[locale]/page.tsx` stays the marketing pitch at `/`. This is the logged-in
 * counterpart: a river of callouts flanked by who is winning and what the
 * viewer's best trades are. The two coexist deliberately and nothing redirects
 * between them yet — sending a returning visitor's reconnecting wallet
 * straight here is exactly the behaviour `LoginRouter`'s note says was removed
 * from the landing page for throwing people into a flow they had not asked for.
 * If `/home` should become the default for a connected wallet, that belongs in
 * the shell's router, once, not as a redirect bolted onto this file.
 *
 * ## Shape
 *
 * `MarketPageProvider` + `AppShell` exactly like `/portfolio` and
 * `/profile/[address]`: the shared chrome calls `useMarketPageContext()` and
 * throws without the provider. `AppShell` owns the top bar and the StatusBar;
 * `SocialColumns` owns only the three-column split, and `HomeFeed` is the
 * centre slot — the same seat `ProfileView` takes on the profile page.
 *
 * No address is passed to `SocialColumns`, which is what makes BOTH rails
 * global: the leaderboard ranks every trader and the right rail ranks the
 * venue's best trades, each assembled across chains by the aggregator. Passing
 * one would scope the right rail to that wallet, which is what /profile does.
 */
export const metadata: Metadata = {
  title: "Home — Iter",
  description:
    "Callouts from the traders you follow, who is winning right now, and what is moving.",
};

export default function Home() {
  const network = DEFAULT_CHAIN_SLUG;

  return (
    <MarketPageProvider networkSlugInput={network}>
      {/* The top bar and the StatusBar at the foot both belong to AppShell — the
          `headerContent` slot is the page's half of the top one, and leaving it
          empty is what made this page look like it had no header at all. */}
      <AppShell
        headerContent={
          <div className="text-sm font-semibold text-[color:var(--m-text-primary)]">Home</div>
        }
      >
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            id="home-page"
            className="w-full"
          >
            <SocialColumns networkSlug={network} topTradesTitle="Top trades">
              <HomeFeed networkSlug={network} />
            </SocialColumns>
          </motion.div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
