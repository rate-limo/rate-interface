"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TokenTable } from "@/components/Organisms/TokenTable";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { PairsTable } from "./PairsTable";
import { TokensTable } from "./TokensTable";
import type { SpotPair } from "@/types";

/**
 * Explore's market table (Explore spec: Surfaces): Pools · Tokens · Watchlist.
 * Pools is the default tab — it's the one whose rows carry the dock's inline
 * actions. Tokens owns its own ranking and source controls (see TokensTable) and
 * fetches a ranked page per view rather than sorting the provider's fixed list;
 * Watchlist stacks the user's starred pairs and tokens.
 */

type MarketTab = "pairs" | "tokens" | "launches" | "watchlist";

/**
 * Launches sits between Tokens and Watchlist and is never the default.
 *
 * Pre-graduation markets are reachable, not promoted: they never appear in a
 * ranking, never in an aggregate, and only ever behind an explicit tab carrying
 * the warning below. They have to be reachable somewhere, though — a market
 * nobody can find cannot attract the quote liquidity it needs to graduate.
 */
const TABS: { key: MarketTab; label: string }[] = [
  { key: "pairs", label: "Pools" },
  { key: "tokens", label: "Tokens" },
  { key: "launches", label: "Launches" },
  { key: "watchlist", label: "Watchlist" },
];

export function MarketTabs({
  className,
  unlistedPairs = [],
  thresholdUsd,
  initialTab = "pairs",
}: {
  className?: string;
  /**
   * Which tab opens first. `/watchlist` mounts this component on "watchlist";
   * everywhere else starts on pairs.
   *
   * Only an INITIAL value — the effect below still moves off an empty pairs tab,
   * and the user can switch freely. A page that forced the tab on every render
   * would make the tab strip look interactive and not be.
   */
  initialTab?: MarketTab;
  /** The operator's listing threshold, read server-side. Passed through to the launch
   * cards so their progress bars and the Approaching-listing shelf read one number. */
  thresholdUsd?: number;
  /** Pre-graduation markets, fetched by the page so this tab and the
   * Approaching-listing shelf cannot disagree about what is unlisted. */
  unlistedPairs?: SpotPair[];
}) {
  const {
    defaultSpotPairData,
    watchlistPairs,
    watchlistTokens,
  } = useMarketPageContext();
  const [tab, setTab] = useState<MarketTab>(initialTab);

  const pairs = (defaultSpotPairData?.pairs ?? []) as SpotPair[];

  useEffect(() => {
    // Only rescues the DEFAULT landing tab. Without the initialTab guard, opening
    // /watchlist on a chain with no listed pairs would bounce straight to
    // launches, and the page would never show the thing it is named after.
    if (initialTab === "pairs" && tab === "pairs" && pairs.length === 0 && unlistedPairs.length > 0) {
      setTab("launches");
    }
  }, [pairs.length, tab, unlistedPairs.length]);

  return (
    <section
      aria-label="All markets"
      className={cn(
        "overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-[0_1px_2px_rgba(20,40,60,.04)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--m-border)] px-5 py-4">
        <div
          role="tablist"
          aria-label="Market list"
          className="inline-flex gap-1 rounded-xl bg-[color:var(--m-surface-2)] p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-lg px-4 py-2 font-dm-mono text-xs tracking-[-0.01em] transition-all active:translate-y-px",
                tab === t.key
                  ? "bg-[color:var(--m-primary)] font-medium text-[color:var(--m-text-primary-inverse)] shadow-[0_2px_8px_color-mix(in_srgb,var(--m-primary)_28%,transparent)]"
                  : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pairs" && (
        <PairsTable className="px-5 pb-3"
          pairs={pairs}
          emptyText="No markets yet on this chain."
        />
      )}
      {tab === "tokens" && <div className="px-5 pb-3"><TokensTable pairs={[...pairs, ...unlistedPairs]} thresholdUsd={thresholdUsd} /></div>}
      {tab === "launches" && (
        <div className="flex flex-col gap-3 px-5 pb-3 pt-4">
          <div className="flex gap-3 rounded-xl border border-[color:var(--m-warning)] bg-[color:color-mix(in_srgb,var(--m-warning)_11%,transparent)] px-4 py-3">
            <span className="shrink-0 font-bold text-[color:var(--m-warning-600)]">
              &#9651;
            </span>
            <p className="m-0 text-[13px] text-[color:var(--m-text-secondary)]">
              <b className="text-[color:var(--m-text-primary)]">
                These are launch tokens.
              </b>{" "}
              They can be traded once a pair is available, and graduate into the listed market
              set when their quote liquidity reaches the operator threshold.
            </p>
          </div>
          <TokensTable pairs={[...pairs, ...unlistedPairs]} thresholdUsd={thresholdUsd} initialSource="launched" />
        </div>
      )}
      {tab === "watchlist" && (
        <div className="flex flex-col gap-6">
          <PairsTable
            pairs={watchlistPairs}
            emptyText="No pairs starred yet — star a market to pin it here."
          />
          {watchlistTokens.length > 0 && (
            <TokenTable data={watchlistTokens} />
          )}
        </div>
      )}
    </section>
  );
}
