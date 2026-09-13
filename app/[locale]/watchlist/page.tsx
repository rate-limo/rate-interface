import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { MarketTabs } from "@/components/Explore/MarketTabs";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { readGraduationThreshold } from "@/lib/liquidity/threshold";

/**
 * The watchlist — starred markets and tokens for the connected wallet.
 *
 * `MarketTabs` has carried a "Watchlist" tab since it was written, including its
 * empty state, and nothing ever imported the component. The stars worked (into
 * `localStorage`) and there was no screen that listed what you had starred. This
 * mounts it.
 *
 * ## Why this path was available
 *
 * The watchlist API deliberately does NOT own `/watchlist`. apps/web rewrites
 * every path it proxies and a rewrite captures every method, so an API on this
 * path would have made the page permanently unreachable — the same trap that put
 * profile writes on `/profile/save`. The API lives under `/wallet/watchlist`,
 * which `proxy.ts` already documents as a prefix that will never be a page.
 *
 * ## Signed out is a normal state
 *
 * `GET /wallet/watchlist` answers an empty list rather than 401 for a visitor
 * with no wallet session, so this renders the tab's own empty copy instead of an
 * error. Nothing here needs to branch on being signed in.
 */

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = supportedNetworkName(readDisplaySlug("explore", await searchParams));
  return {
    title: "Watchlist | Iter",
    description: `Markets and tokens you have starred on ${network}.`,
    // No OG image: a watchlist is per-wallet, so a shared card would either be
    // empty or advertise one person's positions to everyone who sees the link.
    robots: { index: false, follow: true },
  };
}

export default async function WatchlistPage({ searchParams }: PageProps) {
  const network = readDisplaySlug("explore", await searchParams);
  // Read once here and handed down, matching /explore: two independent reads
  // would disagree at exactly the moment a market graduates.
  const thresholdUsd = await readGraduationThreshold();

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6">
            <header className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold text-[color:var(--m-text-primary)]">
                Watchlist
              </h1>
              <p className="text-sm text-[color:var(--m-text-secondary)]">
                Markets and tokens you have starred. Saved to your wallet, so they follow you
                between devices.
              </p>
            </header>
            <MarketTabs initialTab="watchlist" thresholdUsd={thresholdUsd} />
          </div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
