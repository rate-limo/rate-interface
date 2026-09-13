"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";
import type { SpotPair } from "@/types";
import { PairImageIcon } from "@/components/Atoms/PairImageIcon";
import { tokenColor } from "@/lib/swap/tokens";

/**
 * Explore's opinionated shelves (Explore spec): top movers, depth leaders, and
 * just listed, computed client-side from the live pair list — sorts, not new
 * endpoints. Row click opens the pair's market; the inline chips re-bind the
 * Action Dock without navigating. The top-LP-yield shelf lands when pool
 * stats reach the client (spec: Surfaces).
 *
 * These shelves read the LISTED pair list only, and deliberately take no
 * threshold. An "Approaching listing" shelf was built here and removed: on a
 * chain where no launch has quote liquidity yet it renders a column of 0%,
 * which is noise sitting where a ranking should be. Do not reintroduce it —
 * graduation progress belongs on the surfaces that can act on it (the Launches
 * tab and the portfolio's Creator rows), not in a leaderboard.
 */

const ROWS_PER_SHELF = 3;

function depthUSD(p: SpotPair): number {
  return p.dayBaseTvlUSD + p.dayQuoteTvlUSD;
}

function fmtUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

type ShelfDef = {
  title: string;
  rows: SpotPair[];
  metric: (p: SpotPair) => React.ReactNode;
};

export function ExploreShelves({ className }: { className?: string }) {
  const { defaultSpotPairData, displayNetworkSlug, displayNetworkName } = useMarketPageContext();
  const pairs = (defaultSpotPairData?.pairs ?? []) as SpotPair[];

  const shelves = useMemo<ShelfDef[]>(() => {
    const byMove = [...pairs].sort(
      (a, b) =>
        Math.abs(b.dayPriceDifferencePercentage) -
        Math.abs(a.dayPriceDifferencePercentage),
    );
    const byDepth = [...pairs].sort((a, b) => depthUSD(b) - depthUSD(a));
    const byListing = [...pairs].sort((a, b) => b.listingDate - a.listingDate);
    return [
      {
        title: "Top movers 24h",
        rows: byMove.slice(0, ROWS_PER_SHELF),
        metric: (p) => (
          <span
            className={
              p.dayPriceDifferencePercentage >= 0
                ? "text-[color:var(--m-success-fg)]"
                : "text-[color:var(--m-error-fg)]"
            }
          >
            {p.dayPriceDifferencePercentage >= 0 ? "+" : ""}
            {p.dayPriceDifferencePercentage.toFixed(1)}%
          </span>
        ),
      },
      {
        title: "Depth leaders",
        rows: byDepth.slice(0, ROWS_PER_SHELF),
        metric: (p) => <span>{fmtUSD(depthUSD(p))}</span>,
      },
      {
        /**
         * Was "New listings". `listingDate` is the `PairAdded` timestamp — when
         * the market was CREATED, not when it became visible. Once graduation
         * exists those are different dates, and this shelf reads a list that is
         * already filtered to listed pairs, so what it actually shows is the
         * most recently created among the listed ones.
         */
        title: "Just listed",
        rows: byListing.slice(0, ROWS_PER_SHELF),
        metric: (p) => (
          <span>
            {new Date(p.listingDate * 1000).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        ),
      },
    ];
  }, [pairs]);

  // Every shelf reads the listed pair list, so the whole row is empty when it
  // is. Keeping it mounted with empty shelves would read as a broken fetch.
  if (pairs.length === 0) return null;

  return (
    <div
      className={cn(
        // Three shelves. Two-up on tablet rather than a cramped three, which is
        // where the rows started truncating.
        "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {shelves.filter((shelf) => shelf.rows.length > 0).map((shelf) => (
        <div
          key={shelf.title}
          className="rounded-2xl bg-[color:var(--m-surface)] p-5 shadow-[0_1px_2px_rgba(20,40,60,.04)]"
        >
          <div className="mb-3 text-sm font-medium text-[color:var(--m-text-primary)]">
            {shelf.title}
          </div>
          <ul>
            {shelf.rows.map((p) => (
              <li
                key={p.id}
                className="border-b border-[color:var(--m-border)] last:border-b-0"
              >
                <Link
                  href={buildPageUrl("pair", {
                    base: p.baseSymbol,
                    quote: p.quoteSymbol,
                    slug: displayNetworkSlug,
                  })}
                  className="group flex min-h-12 items-center justify-between gap-3 py-2 text-sm transition-colors"
                >
                  {/* The pair's real mark, network chip included. These rows are
                      MARKETS and drew none of that — no logos, no chain — while
                      every other market row on the site carries them. Same
                      component and the same fallbacks, so a token with no
                      artwork degrades to its hued initials rather than a gap. */}
                  <span className="flex min-w-0 items-center gap-2.5">
                    <PairImageIcon
                      base={p.baseSymbol}
                      quote={p.quoteSymbol}
                      baseLogoURI={p.base.logoURI ?? undefined}
                      quoteLogoURI={p.quote.logoURI ?? undefined}
                      baseColor={tokenColor(p.baseSymbol)}
                      quoteColor={tokenColor(p.quoteSymbol)}
                      chainName={displayNetworkName}
                      className="h-7 w-7"
                    />
                    <span className="min-w-0 truncate font-medium text-[color:var(--m-text-primary)] group-hover:text-[color:var(--m-primary-fg)]">
                      {p.symbol}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-dm-mono text-xs text-[color:var(--m-text-secondary)]">
                    {shelf.metric(p)} <span aria-hidden>→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
