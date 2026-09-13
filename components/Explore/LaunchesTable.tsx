"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Grid2X2, List, Sparkles, TrendingUp } from "lucide-react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { type TokenRanking } from "@/hooks/useTokens";
import { useMultichainTokens } from "@/hooks/useMultichainTokens";
import { networkNameToSlug } from "@/consts";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { TokenCards } from "./TokenCards";
import type { SpotPair, SpotToken } from "@/types";

type LaunchView = "all" | "recent" | "trending";
type LaunchLayout = "table" | "cards";

const VIEWS: { key: LaunchView; label: string; icon: typeof Grid2X2; ranking: TokenRanking }[] = [
  { key: "all", label: "All", icon: Grid2X2, ranking: "top-marketcap" },
  { key: "recent", label: "Recently launched", icon: Sparkles, ranking: "new" },
  { key: "trending", label: "Trending", icon: TrendingUp, ranking: "trending" },
];

function compactAge(timestamp: number, now: number | null): string {
  if (now === null) return "—";
  if (!timestamp || timestamp <= 0) return "—";
  const seconds = Math.max(0, now - timestamp);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d`;
  return `${Math.floor(seconds / 2_592_000)}mo`;
}

function compactUSD(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-[color:var(--m-text-secondary-2)]">—</span>;
  }
  const positive = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", positive ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>
      <span aria-hidden className="text-[9px]">{positive ? "▲" : "▼"}</span>
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function LaunchesSkeleton() {
  return (
    <div role="status" aria-label="Loading launches" className="space-y-1">
      <div className="h-11 animate-pulse rounded-xl bg-[color:var(--m-surface-2)]" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="grid min-h-[82px] grid-cols-[42px_minmax(190px,1.4fr)_minmax(120px,1fr)_repeat(5,minmax(82px,1fr))] items-center gap-4 border-b border-[color:var(--m-border)]/60 px-3">
          {Array.from({ length: 8 }, (_, cell) => <span key={cell} className={cn("h-3 animate-pulse rounded bg-[color:var(--m-surface-2)]", cell === 1 ? "w-32" : "w-16")} />)}
        </div>
      ))}
    </div>
  );
}

export function LaunchesTable({ pairs = [], thresholdUsd }: { pairs?: SpotPair[]; thresholdUsd?: number }) {
  const router = useRouter();
  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext();
  const [view, setView] = useState<LaunchView>("all");
  const [layout, setLayout] = useState<LaunchLayout>("table");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const selected = VIEWS.find((item) => item.key === view) ?? VIEWS[0]!;
  /**
   * Every chain's launches, from the aggregator.
   *
   * This asked ONE chain — `useInfiniteTokens(displayNetworkName, ...)` — while
   * the four tabs beside it were cross-chain, so the Launches tab silently
   * showed a subset of the venue under a heading that names no network. The
   * aggregator serves the same list behind `?source=launched`, which is the
   * gateway's own parameter rather than a separate endpoint.
   *
   * 200 rows in one page, as before: the previous hook was an infinite query
   * that this table never paged, so nothing is lost by asking once.
   */
  const { tokens, isLoading } = useMultichainTokens(200, 1, selected.ranking, "launched");
  // The aggregator answers 502 only when EVERY chain fails, and the hook turns
  // that into an empty list; a partial failure still renders the chains that
  // answered. There is no per-chain error to show here any more.
  const error = null;

  return (
    <section aria-label="All launches" className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-medium tracking-[-0.045em] text-[color:var(--m-text-primary)] sm:text-4xl">All launches</h2>
          <div role="tablist" aria-label="Launch views" className="mt-5 flex flex-wrap items-center gap-2">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm transition-colors",
                  view === key
                    ? "bg-[color:var(--m-primary)] font-medium text-[color:var(--m-text-primary-inverse)] shadow-[0_2px_8px_color-mix(in_srgb,var(--m-primary)_28%,transparent)]"
                    : "text-[color:var(--m-text-secondary)] hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)]",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-11 items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 text-sm text-[color:var(--m-text-primary)] shadow-sm">
            All launchpads <ChevronDown aria-hidden className="h-4 w-4 text-[color:var(--m-text-secondary)]" />
          </button>
          <ChainSwitcher />
          <div role="group" aria-label="Launch layout" className="inline-flex h-11 items-center rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-1 shadow-sm">
            {([
              ["table", List, "Table view"],
              ["cards", Grid2X2, "Card view"],
            ] as const).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={layout === key}
                onClick={() => setLayout(key)}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg transition-colors",
                  layout === key
                    ? "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)] shadow-sm"
                    : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <p className="py-10 text-center text-sm text-[color:var(--m-text-secondary)]">Could not reach the launch data source.</p>
      ) : isLoading ? (
        <LaunchesSkeleton />
      ) : tokens.length === 0 ? (
        <p className="py-10 text-center text-sm text-[color:var(--m-text-secondary)]">No launches on this chain yet.</p>
      ) : layout === "cards" ? (
        <TokenCards
          tokens={tokens}
          pairs={pairs}
          now={now}
          networkSlug={displayNetworkSlug}
          chainName={displayNetworkName}
          thresholdUsd={thresholdUsd}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-[15px]">
            <thead>
              <tr className="rounded-xl bg-[color:var(--m-surface-2)] text-left text-[13px] text-[color:var(--m-text-secondary)]">
                <th className="rounded-l-xl px-3 py-4 font-normal">#</th>
                <th className="px-3 py-4 font-normal">Token</th>
                <th className="px-3 py-4 font-normal">Launchpad</th>
                <th className="px-3 py-4 text-right font-normal">FDV</th>
                <th className="px-3 py-4 text-right font-normal">↓ 24H volume</th>
                <th className="px-3 py-4 text-right font-normal">Liquidity</th>
                <th className="px-3 py-4 text-right font-normal">1H</th>
                <th className="px-3 py-4 text-right font-normal">1D</th>
                <th className="rounded-r-xl px-3 py-4 text-right font-normal">Age</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token, index) => {
                // Slugged to the TOKEN's own chain, not the page's — the list is
                // cross-chain, so the page's slug would send half these rows to
                // a chain that has never heard of them.
                const rowChain = (token as SpotToken & { chain?: string }).chain;
                const rowSlug = rowChain ? (networkNameToSlug[rowChain] ?? displayNetworkSlug) : displayNetworkSlug;
                const tokenUrl = `/explore/tokens/${encodeURIComponent(token.symbol)}?chain=${encodeURIComponent(rowSlug)}`;
                return (
                  <tr
                    key={token.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(tokenUrl)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(tokenUrl); } }}
                    className="cursor-pointer border-b border-[color:var(--m-border)]/60 transition-colors hover:bg-[color:var(--m-surface-2)]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--m-primary)]"
                  >
                    <td className="px-3 py-5 font-dm-mono text-sm tabular-nums text-[color:var(--m-text-secondary)]">{index + 1}</td>
                    <td className="px-3 py-5">
                      <span className="flex items-center gap-3">
                        <TokenImageIcon symbol={token.symbol} logoURI={token.logoURI} color={tokenColor(token.symbol)} size="md" chainName={(token as SpotToken & { chain?: string }).chain ?? displayNetworkName} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[color:var(--m-text-primary)]">{token.name || token.symbol}</span>
                          <span className="block truncate font-dm-mono text-xs text-[color:var(--m-text-secondary)]">{token.symbol}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-5 text-[color:var(--m-text-primary)]"><span className="inline-flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--m-surface-2)] text-xs">✦</span>Iter Launchpad</span></td>
                    <td className="px-3 py-5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{compactUSD(token.marketCap)}</td>
                    <td className="px-3 py-5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{compactUSD(token.dayVolumeUSD)}</td>
                    <td className="px-3 py-5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{compactUSD(token.dayTvlUSD)}</td>
                    <td className="px-3 py-5 text-right font-dm-mono"><Change value={token.priceUSD1HourBF > 0 ? ((token.priceUSD - token.priceUSD1HourBF) / token.priceUSD1HourBF) * 100 : null} /></td>
                    <td className="px-3 py-5 text-right font-dm-mono"><Change value={token.dayPriceDifferencePercentage} /></td>
                    <td className="px-3 py-5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">{compactAge(token.listingDate, now)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
