"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid2X2, Sparkles, TrendingUp } from "lucide-react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useInfiniteTokens, type TokenRanking } from "@/hooks/useTokens";
import { tokenColor } from "@/lib/portfolio/mock";
import { formatMarketCap } from "@/utils/number";
import { cn } from "@/lib/utils";
import type { SpotToken } from "@/types";

type LaunchView = "all" | "recent" | "trending";

const VIEWS: { key: LaunchView; label: string; icon: typeof Grid2X2; ranking: TokenRanking }[] = [
  { key: "all", label: "All", icon: Grid2X2, ranking: "top-marketcap" },
  { key: "recent", label: "Recently launched", icon: Sparkles, ranking: "new" },
  { key: "trending", label: "Trending", icon: TrendingUp, ranking: "trending" },
];

/**
 * Progress toward the listing threshold, or null when there is nothing to
 * measure against.
 *
 * Null rather than 0: `thresholdUsd` is absent until the operator has set one,
 * and a bar pinned at zero states "this launch has raised nothing" as a fact
 * when the truth is that the target is unknown.
 */
function graduationPct(token: SpotToken, thresholdUsd?: number): number | null {
  if (!thresholdUsd || thresholdUsd <= 0) return null;
  const cap = token.marketCap;
  if (typeof cap !== "number" || !Number.isFinite(cap)) return null;
  return Math.max(0, Math.min(100, (cap / thresholdUsd) * 100));
}

function LaunchCard({ token, thresholdUsd }: { token: SpotToken; thresholdUsd?: number }) {
  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext();
  const pct = graduationPct(token, thresholdUsd);
  const change = token.dayPriceDifferencePercentage;
  const hasChange = typeof change === "number" && Number.isFinite(change);
  const href = `/explore/tokens/${encodeURIComponent(token.symbol)}?chain=${encodeURIComponent(displayNetworkSlug)}`;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3.5 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4 transition-colors hover:border-[color:var(--m-text-secondary-2)]"
    >
      <div className="flex items-start gap-3">
        <TokenImageIcon
          symbol={token.symbol}
          logoURI={token.logoURI}
          color={tokenColor(token.symbol)}
          size="lg"
          chainName={displayNetworkName}
        />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium text-[color:var(--m-text-primary)]">
            {token.name || token.symbol}
          </span>
          <span className="truncate font-dm-mono text-xs text-[color:var(--m-text-secondary)]">
            {token.symbol}
          </span>
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col">
          <span className="font-dm-mono text-[10px] tracking-[0.12em] text-[color:var(--m-text-secondary)] uppercase">
            Market cap
          </span>
          {/* Read from spotTokens.marketCap, a generated column. Never price ×
              supply here -- that second source of truth is what the column was
              introduced to delete. An absent value is a dash, never $0. */}
          <span className="mt-0.5 font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
            {formatMarketCap(token.marketCap)}
          </span>
        </span>
        {hasChange && (
          <span
            className={cn(
              "font-dm-mono text-xs tabular-nums",
              change >= 0 ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]",
            )}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
      </div>

      {pct !== null && (
        <span className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
            <span>To listing</span>
            <span className="tabular-nums">{Math.round(pct)}%</span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]">
            <span
              className="block h-full rounded-full bg-[color:var(--m-primary)] transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </span>
        </span>
      )}
    </Link>
  );
}

/**
 * Every token launched on this chain, as cards.
 *
 * Rows come from `useInfiniteTokens(..., "launched")` — the same hook and the
 * same `source` the Launches tab inside /explore uses, so the two surfaces
 * cannot disagree about what counts as a launch. This is presentation only; if
 * the definition of "launched" changes, it changes in one place.
 */
export function LaunchGrid({ thresholdUsd }: { thresholdUsd?: number }) {
  const { displayNetworkName } = useMarketPageContext();
  const [view, setView] = useState<LaunchView>("all");
  const selected = VIEWS.find((item) => item.key === view) ?? VIEWS[0]!;
  const { data, isLoading, error } = useInfiniteTokens(
    displayNetworkName,
    200,
    selected.ranking,
    "launched",
  );
  const tokens = useMemo(
    () => (data?.pages.flatMap((page) => page.tokens) ?? []) as SpotToken[],
    [data],
  );

  return (
    <section aria-label="Launches" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-medium tracking-[-0.045em] text-[color:var(--m-text-primary)] sm:text-4xl">
            Launches
          </h1>
          <p className="mt-2 max-w-[58ch] text-sm text-[color:var(--m-text-secondary)]">
            Every token created on {displayNetworkName}, newest markets included.
            A launch is reachable here before it is listed.
          </p>
        </div>
        <div role="tablist" aria-label="Launch views" className="flex flex-wrap items-center gap-2">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                view === key
                  ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-primary)]"
                  : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]",
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Three states, deliberately distinct. "Nothing launched yet" and "the
          indexer did not answer" look identical if both render an empty grid,
          and the second is not the user's fault. */}
      {isLoading ? (
        <p className="py-16 text-center text-sm text-[color:var(--m-text-secondary)]">
          Loading launches…
        </p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-[color:var(--m-text-secondary)]">
          Couldn&apos;t reach the indexer, so there are no launches to show yet.
        </p>
      ) : tokens.length === 0 ? (
        <p className="py-16 text-center text-sm text-[color:var(--m-text-secondary)]">
          Nothing has launched on {displayNetworkName} yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tokens.map((token) => (
            <LaunchCard key={token.id} token={token} thresholdUsd={thresholdUsd} />
          ))}
        </div>
      )}
    </section>
  );
}
