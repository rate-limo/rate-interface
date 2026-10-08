"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import numeral from "numeral";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useInfiniteTokens, type TokenRanking, type TokenSource } from "@/hooks/useTokens";
import { useMultichainTokens } from "@/hooks/useMultichainTokens";
import { sparklineKey, useTokenSparklines } from "@/hooks/useTokenSparklines";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { networkNameToSlug } from "@/consts";
import { formatMarketCap } from "@/utils/number";
import { cn } from "@/lib/utils";
import type { SpotPair, SpotToken } from "@/types";
import { TokenCards } from "./TokenCards";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";
import { DEFAULT_THRESHOLD_USD } from "@/lib/liquidity/thresholdDefault";

/**
 * Explore → Tokens.
 *
 * This component owns no controls. Source comes from the directory tab that mounted it
 * (Launches IS source=launched), the filter field lives in the panel header beside the
 * chain switcher, and ordering is the column headers. It previously carried its own
 * ranking pills, source toggle and cards/table toggle inside the panel — three control
 * groups restating choices made above them, and two of them offering a second way to
 * sort. Removed 2026-08-13.
 *
 * The lost capability is worth naming rather than discovering later: ranking was a
 * SERVER route deciding which page of tokens to fetch, so it is not the same thing as a
 * column sort, which only reorders the rows already here.
 *
 * The DEFAULT is `top-volume`, and was `trending` until that was found to return
 * NOTHING. Every `trending` strategy applies an operator-set `minVolumeUsd` floor,
 * and on this venue that floor sits above the entire day's volume — so the ranking
 * was empty, this table fell back to an unranked list, and every surface using the
 * default showed an arbitrary order under a label promising otherwise.
 * `top-volume` asks the question the label implies, has no floor, and agrees with
 * the column sort below. The operator-defined "trending" ranking is no longer
 * reachable from this table.
 *
 * Owned by Explore rather than reusing `Organisms/TokenTable`, for the same reason
 * `PairsTable` is: that component is shared with the prices page and does not know about
 * launches.
 */

/** The sortable columns, and the key each one orders by. Declared once — the
 *  header used to inline this map twice on a single line, once to sort and
 *  once to decide the arrow, so the two could drift apart silently.
 *
 *  FDV, not "market cap": `spotTokens.marketCap` is the generated column
 *  `priceUSD * totalSupply`, i.e. every token ever minted valued at the current
 *  price. That is fully diluted valuation. Calling it market cap implies a
 *  circulating-supply figure this chain does not compute. */
const SORT_COLUMNS: { label: string; key: string }[] = [
  { label: "Price", key: "price" },
  { label: "1H", key: "change1h" },
  { label: "1D", key: "change" },
  { label: "FDV", key: "marketCap" },
  { label: "Volume", key: "volume" },
];

/** The column sort that agrees with a server ranking.
 *
 *  Every ranking is a server-side ORDER BY, and the table sorts the page it
 *  receives. When the two disagree the client wins and the ranking becomes
 *  invisible — which is precisely how `top-gainer` and `top-loser` came to
 *  render the same FDV-ordered list. Keeping the mapping here, next to the
 *  column keys it names, means a new ranking pill is one line rather than a
 *  silent no-op. */
function defaultSort(ranking: TokenRanking): { key: string; direction: "asc" | "desc" } {
  switch (ranking) {
    case "trending":
      return { key: "volume", direction: "desc" };
    case "top-gainer":
      return { key: "change", direction: "desc" };
    case "top-loser":
      return { key: "change", direction: "asc" };
    case "top-volume":
      return { key: "volume", direction: "desc" };
    case "new":
      return { key: "age", direction: "desc" };
    case "oldest":
      return { key: "age", direction: "asc" };
    default:
      return { key: "marketCap", direction: "desc" };
  }
}

/** Percent move over the last hour, from the price the row carries for an hour
 *  ago. Null when there is no prior price to compare against — a bare 0% would
 *  claim the price held. */
function hourChange(token: SpotToken): number | null {
  const before = token.priceUSD1HourBF;
  if (!before || !Number.isFinite(before) || !token.priceUSD) return null;
  return ((token.priceUSD - before) / before) * 100;
}

/** A change cell: a triangle that states the direction, then the number. Grey
 *  and flat at exactly zero, because green-and-up for "unchanged" is a claim. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[color:var(--m-text-secondary-2)]">—</span>;
  const flat = Math.abs(value) < 0.005;
  const tone = flat
    ? "text-[color:var(--m-text-secondary-2)]"
    : value > 0
      ? "text-[color:var(--m-success-fg)]"
      : "text-[color:var(--m-error-fg)]";
  return (
    <span className={cn("inline-flex items-center justify-end gap-1.5", tone)}>
      <span aria-hidden className="text-[9px] leading-none">{flat ? "▲" : value > 0 ? "▲" : "▼"}</span>
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

/** The 1D series as a bare line. No axis, no fill — at this size a fill reads as
 *  a filled area chart and invites comparison between rows that share no scale. */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-[color:var(--m-text-secondary-2)]">—</span>;
  const width = 92;
  const height = 28;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const rising = points[points.length - 1]! >= points[0]!;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className="ml-auto block">
      <polyline
        points={line}
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke={rising ? "var(--m-success-fg)" : "var(--m-error-fg)"}
      />
    </svg>
  );
}

type View = "cards" | "table";

/**
 * The presentation follows the source, because the two answer different questions.
 *
 * Launched is discovery — the art and the progress toward listing are the content, which
 * is what a card grid is for. Listed is comparison, where the numbers are the content and
 * a grid of four giant logos says nothing. `all` stays a table: a mixed grid puts a $196b
 * asset and an eleven-minute-old coin in identical squares, flattering one and
 * misrepresenting the other.
 *
 * Now fixed rather than a default: the Cards/Table toggle that used to override it was
 * removed with the rest of the in-panel controls, so the tab decides the presentation.
 */
function defaultView(source: TokenSource): View {
  return source === "launched" ? "cards" : "table";
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-pulse rounded-md bg-[color:var(--m-surface-2)] motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function TokenTableSkeleton() {
  return (
    <div role="status" aria-label="Loading tokens" className="overflow-hidden">
      <div className="grid grid-cols-[48px_minmax(180px,1fr)_repeat(5,minmax(76px,.55fr))_108px] items-center border-b border-[color:var(--m-border)] py-3">
        <SkeletonBlock className="ml-2 h-3 w-3" />
        <SkeletonBlock className="h-3 w-12" />
        {["w-12", "w-7", "w-7", "w-8", "w-10", "w-16"].map((width, index) => (
          <SkeletonBlock key={index} className={cn("ml-auto mr-4 h-3", width)} />
        ))}
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="grid min-h-[73px] grid-cols-[48px_minmax(180px,1fr)_repeat(5,minmax(76px,.55fr))_108px] items-center border-b border-[color:var(--m-border)]/50"
        >
          <SkeletonBlock className="ml-2 h-3 w-4" />
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
            <span className="flex flex-col gap-2">
              <SkeletonBlock className="h-3.5 w-24" />
              <SkeletonBlock className="h-2.5 w-12" />
            </span>
          </div>
          {["w-16", "w-12", "w-12", "w-[72px]", "w-16"].map((width, cell) => (
            <SkeletonBlock key={cell} className={cn("ml-auto mr-4 h-3", width)} />
          ))}
          <SkeletonBlock className="ml-auto mr-2 h-7 w-[92px] rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function TokenCardSkeleton() {
  return (
    <div role="status" aria-label="Loading tokens" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-2xl border border-[color:var(--m-border)] p-4">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-11 w-11 rounded-full" />
            <div className="flex flex-col gap-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </div>
          <SkeletonBlock className="mt-6 h-3 w-24" />
          <SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
          <div className="mt-5 flex justify-between">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TokensTable({
  pairs = [],
  thresholdUsd,
  initialSource = "all",
  search = "",
  ranking = "top-volume",
  className,
}: {
  /** Every pair on the chain, for the cards' progress-to-listing lookup. Passed in rather
   * than fetched so the cards and the Approaching-listing shelf cannot disagree. */
  pairs?: SpotPair[];
  /** Operator-set listing threshold; the cards' progress bars measure against it. */
  thresholdUsd?: number;
  initialSource?: TokenSource;
  /** Controlled by the panel header, which owns the filter field so it can sit
   *  beside the chain switcher and search rather than in a second control row. */
  search?: string;
  /** Which gateway ranking route to fetch — set by the token-tag strip in the
   *  panel header. This decides WHICH tokens arrive; the column headers decide
   *  the order of the ones that did. */
  ranking?: TokenRanking;
  className?: string;
}) {
  const { displayNetworkName, displayNetworkSlug, chainFilter } = useMarketPageContext();
  /**
   * Scope lives on the PROVIDER, not here.
   *
   * The shelves and the tape read the same filter, so one control governs the
   * whole page. Local state here meant this table could say "All chains" while
   * the shelves above it were still showing one — two scopes on one screen, with
   * nothing saying which was which.
   *
   * Null means every served chain; a name narrows to it.
   */
  const allChains = chainFilter === null;

  const router = useRouter();
  // Clock read in an effect, never during render: the server cannot know it, and the
  // relative times below would mismatch on hydration. Null until mounted, which the
  // formatters render as an em-dash for one frame.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // Both fixed by the tab that mounted this, no longer switchable here. The
  // Listed/Launched/All and Cards/Table toggles sat inside the panel repeating a
  // choice the directory tabs above already make -- Launches IS source=launched.
  // Two controls for one decision is how they end up disagreeing.
  const source = initialSource;
  const view = defaultView(source);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteTokens(displayNetworkName, 200, ranking, source);

  // Cross-chain by default. Explore answers "what is worth looking at", and that
  // question does not stop at the chain the URL happens to name — a token on
  // another network is not less interesting for it. The single-chain list stays
  // one click away, because "what is on Arc" is a different, also-valid question.
  const {
    tokens: mergedTokens,
    isLoading: mergedLoading,
    chainsLoaded,
    chainsTotal,
    // 100, not 200. `overFetch` caps each chain's request at the gateway's own
    // clamp, so asking for 200 fetched 100 per chain and then sliced to 200 —
    // which is only provably the global top 200 while no single chain holds more
    // than 100 of them. At 100 the guarantee holds outright: anything in the
    // global top 100 is in its own chain's top 100.
  } = useMultichainTokens(100, 1, ranking, source, chainFilter ? [chainFilter] : undefined);

  /**
   * A merged row carries its own `chain`; a single-chain row does not need to.
   * Reading it per row is what stops a RISE token wearing an Arc badge and
   * linking to Arc's page — the merge is keyed on (chain, address) precisely
   * because the same symbol on two chains is two different markets.
   */
  const chainOf = (t: SpotToken): string =>
    (t as SpotToken & { chain?: string }).chain ?? displayNetworkName;

  const singleChainTokens = (data?.pages.flatMap((page) => page.tokens) ?? []) as SpotToken[];
  const apiTokens: SpotToken[] = allChains ? mergedTokens : singleChainTokens;
  /*
   * The fallback rows, each carrying THE CHAIN OF THE PAIR IT CAME FROM.
   *
   * The aggregator puts `chain` on a pair and not on `pair.base` / `pair.quote`
   * — verified against the live payload — so flattening the pairs produced
   * tokens with no chain at all. `chainOf` then fell back to the page's single
   * `displayNetworkName` for every one of them, and this list is cross-chain.
   *
   * That is why Popular showed an empty 1D chart on exactly the RISE rows while
   * the Arc rows drew: `useTokenSparklines` asks each token's OWN gateway, and
   * every token here claimed to be on Arc, so RISE's coins were requested from
   * Arc's gateway, which 404s for an address it has never seen. The hook turns
   * that into an empty series and the column renders an em dash — no error
   * anywhere, on a row whose price and percentages were all correct.
   *
   * The New tab was unaffected because the aggregator serves that ranking, so it
   * never reaches this fallback. Popular does reach it: `trending` applies an
   * operator-set `minVolumeUsd` floor that every token on this testnet is below,
   * so the ranking legitimately returns nothing and the table falls back here.
   *
   * The dedupe key gains the chain for the same reason. Keyed on the address
   * alone, one chain's token silently replaced the other's — the merge's own
   * docstring is explicit that (chain, address) is the identity, because the
   * same symbol and even the same address on two chains are two markets.
   */
  const pairTokens = Array.from(
    new Map(
      pairs
        .flatMap((pair) => {
          const chain = (pair as SpotPair & { chain?: string }).chain;
          return [pair.base, pair.quote].map((token) =>
            chain ? ({ ...token, chain } as SpotToken) : token,
          );
        })
        .map((token) => [
          `${(token as SpotToken & { chain?: string }).chain ?? ""}|${token.id.toLowerCase()}`,
          token,
        ]),
    ).values(),
  );
  // Some indexer deployments expose launch metadata through /pairs/unlisted before
  // the equivalent token ranking routes. Both payloads are gateway-owned; this keeps
  // Explore populated without inventing rows while those indexes catch up.
  const allTokens = apiTokens.length > 0
    ? apiTokens
    : pairTokens.filter((token) =>
        source === "listed" ? token.verified === true : source === "launched" ? (token.creator ?? "") !== "" : true,
      );
  const tokens = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allTokens;
    return allTokens.filter((token) =>
      [token.name, token.symbol, token.id].some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [allTokens, search]);
  // The initial column sort has to AGREE with the ranking that fetched the rows,
  // because it runs over them afterwards and wins.
  //
  // This is what broke the Gainers and Losers tabs. The gateway returns exactly
  // the right page — top-gainer led with PHNX at +4.91%, top-loser with YEAST at
  // -5.84% — and then this table re-sorted every non-trending ranking by FDV,
  // so both tabs rendered the same FDV-ordered list and looked identical to
  // "All". The server order was correct and discarded one line later.
  //
  // Losers open ASCENDING: the biggest fall is the most negative number, so
  // "most" for that tab is the bottom of the range, not the top.
  const [sort, setSort] = useState(() => defaultSort(ranking));
  useEffect(() => {
    setSort(defaultSort(ranking));
  }, [ranking]);
  const sortedTokens = [...tokens].sort((a, b) => {
    const value = (token: SpotToken): string | number | null => ({ symbol: token.symbol, price: token.priceUSD ?? null, change1h: hourChange(token), change: token.dayPriceDifferencePercentage ?? null, marketCap: token.marketCap ?? null, volume: token.dayVolumeUSD ?? null, lastPriced: token.priceUpdatedAt ?? null, age: token.listingDate ?? null }[sort.key] ?? null);
    const left = value(a); const right = value(b);
    // A token with no value for this column sinks in BOTH directions, instead of
    // standing in as a zero. On an ascending sort — which is what the Losers tab
    // is — a substituted 0 outranks every real fall, so the tab led with tokens
    // that had never priced and buried the actual biggest loser.
    if (left === null || right === null) {
      if (left === right) return 0;
      return left === null ? 1 : -1;
    }
    const comparison = typeof left === "string" ? left.localeCompare(String(right)) : Number(left) - Number(right);
    return sort.direction === "asc" ? comparison : -comparison;
  });
  // Charts are their own request per token, so they load after the table rather
  // than holding it back. See the hook for why the row's own sparkline7D is not
  // usable.
  // Each token carries its own chain — see the hook for why a single page-wide
  // network emptied this column on every cross-chain row.
  const sparklines = useTokenSparklines(
    tokens.map((t) => ({ id: t.id, chain: chainOf(t) })),
  );

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "500px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // A new column opens descending: every sortable column here is a quantity,
  // and "most" is what the first click means for all of them.
  const toggleSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );

  return (
    <section aria-label="Tokens" className={cn("flex flex-col gap-3", className)}>
      {/* The scope CHIPS are gone; the count is not.
       *
       * `ChainSwitcher` sits in the panel header directly above this table and
       * writes the same `chainFilter` these chips wrote — so the page carried two
       * controls for one piece of state, one of them repeating the other's answer
       * a few pixels below it.
       *
       * The degradation notice stays, because the switcher cannot say it: "All
       * chains" that quietly dropped a network reads as "there is little here"
       * rather than "a gateway is down", and that is the one thing this row was
       * telling the reader that nothing else does. */}
      {allChains && chainsLoaded < chainsTotal ? (
        <div className="flex justify-end">
          <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
            {chainsLoaded} of {chainsTotal} chains
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="py-8 text-center text-sm text-[color:var(--m-text-secondary)]">
          Could not reach the market data source.
        </p>
      ) : (allChains ? mergedLoading : isLoading) ? (
        view === "cards" ? <TokenCardSkeleton /> : <TokenTableSkeleton />
      ) : tokens.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--m-text-secondary)]">
          {source === "launched"
            ? "No launched tokens on this chain yet."
            : "No tokens match this view."}
        </p>
      ) : view === "cards" ? (
        <TokenCards
          tokens={tokens}
          pairs={pairs}
          now={now}
          networkSlug={displayNetworkSlug}
            // The card view takes one chain for the whole list, so it cannot label
            // merged rows individually — it would stamp the page's chain on a token
            // from another. Cards stay single-chain until TokenCards reads `chain`
            // off each row.
            chainName={displayNetworkName}
          thresholdUsd={thresholdUsd}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px] sm:text-base">
            <thead>
              <tr className="border-b border-[color:var(--m-border)] text-left">
                <th className="w-12 py-3 pl-2 pr-3 text-sm font-normal text-[color:var(--m-text-secondary-2)]">#</th>
                <th className="py-3 pr-4 text-sm font-normal text-[color:var(--m-text-secondary)]">
                  Token
                </th>
                {SORT_COLUMNS.map(({ label, key }) => {
                  const active = sort.key === key;
                  return (
                    <th
                      key={key}
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                      className="py-3 pr-4 text-right text-sm font-normal text-[color:var(--m-text-secondary)]"
                    >
                      {/* Only the sorted column carries an arrow, and it points the
                          one way the data is actually ordered. An idle column used
                          to render "↕", which states both directions at once and so
                          describes no order at all. */}
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className={cn(
                          "inline-flex w-full items-center justify-end gap-1.5 hover:text-[color:var(--m-text-primary)]",
                          active && "text-[color:var(--m-text-primary)]",
                        )}
                      >
                        {/* Arrow first: it belongs to the column, and trailing it
                            pushes the label off the right edge it aligns to.

                            It points at THE END OF THE RANGE THAT IS ON TOP, not
                            at the sort direction — descending puts the largest
                            values first, so it points up. Read the other way it
                            is actively wrong on the tab it matters most for:
                            Losers sorts ascending, so the biggest FALLS are at
                            the top, and the column was drawing "↑ 1D" over a list
                            of negative numbers. */}
                        {active && (
                          <span aria-hidden className="font-dm-mono text-xs">
                            {sort.direction === "asc" ? "↓" : "↑"}
                          </span>
                        )}
                        {label}
                      </button>
                    </th>
                  );
                })}
                <th className="py-3 pr-2 text-right text-sm font-normal text-[color:var(--m-text-secondary)]">1D chart</th>
              </tr>
            </thead>
            <tbody>
              {sortedTokens.map((t, index) => {
                // Still needed for the badge below — but no longer for routing.
                const isLaunch = (t.creator ?? "") !== "";
                // One destination for every row. This used to branch on
                // `creator`, so a launched token opened a page you could trade
                // from and a listed one opened a different page that you could
                // not — from adjacent rows of the same table.
                const profileUrl = buildPageUrl("token", {
                  token: t.symbol,
                  slug: networkNameToSlug[chainOf(t)] ?? displayNetworkSlug,
                });
                return (
                  <tr
                    key={t.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${t.symbol} token profile`}
                    onClick={() => router.push(profileUrl)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(profileUrl);
                      }
                    }}
                    className="cursor-pointer border-b border-[color:var(--m-border)]/50 hover:bg-[color:var(--m-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--m-primary)] focus-visible:outline-offset-[-2px]"
                  >
                    <td className="w-12 py-4 pl-2 pr-3 text-left font-dm-mono text-sm tabular-nums text-[color:var(--m-text-secondary-2)]">
                      {index + 1}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="flex flex-wrap items-center gap-2.5">
                        <TokenImageIcon
                          symbol={t.symbol}
                          logoURI={t.logoURI}
                          color={tokenColor(t.symbol)}
                          size="md"
                          chainName={chainOf(t)}
                        />
                        {/* Name over ticker. The name is what a reader recognises;
                            the ticker is what they type. Both, in that order. */}
                        <span className="min-w-0">
                          <span className="block truncate font-medium leading-tight text-[color:var(--m-text-primary)]">
                            {t.name || t.symbol}
                          </span>
                          <span className="block truncate font-dm-mono text-xs leading-tight text-[color:var(--m-text-secondary)]">
                            {t.symbol}
                          </span>
                        </span>
                        {isLaunch && (
                          <span
                            title="Created through Rate's launch flow"
                            className="rounded-full px-1.5 py-px font-dm-mono text-[8.5px] font-bold uppercase tracking-wide"
                            style={{
                              color: "var(--m-logo)",
                              backgroundColor: "color-mix(in srgb, var(--m-logo) 16%, transparent)",
                            }}
                          >
                            launched
                          </span>
                        )}
                        {!t.verified && (
                          <span
                            title="Its market has not met the quote-liquidity threshold yet"
                            className="rounded-full px-1.5 py-px font-dm-mono text-[8.5px] font-bold uppercase tracking-wide"
                            style={{
                              color: "var(--m-warning)",
                              backgroundColor:
                                "color-mix(in srgb, var(--m-warning) 18%, transparent)",
                            }}
                          >
                            unlisted
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                      {t.priceUSD ? numeral(t.priceUSD).format("$0,0.[0000]") : "—"}
                    </td>
                    <td className="py-4 pr-4 text-right font-dm-mono tabular-nums">
                      <Change value={hourChange(t)} />
                    </td>
                    <td className="py-4 pr-4 text-right font-dm-mono tabular-nums">
                      <Change value={t.dayPriceDifferencePercentage ?? null} />
                    </td>
                    <td className="py-4 pr-4 text-right font-dm-mono font-semibold tabular-nums text-[color:var(--m-text-primary)]">
                      {formatMarketCap(t.marketCap)}
                    </td>
                    <td className="py-4 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                      {t.dayVolumeUSD ? formatMarketCap(t.dayVolumeUSD) : "—"}
                    </td>
                    <td className="py-4 pr-2 text-right">
                      <Sparkline points={sparklines.get(sparklineKey(chainOf(t), t.id)) ?? []} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div ref={loadMoreRef} className="flex min-h-10 items-center justify-center text-xs text-[color:var(--m-text-secondary-2)]">
            {isFetchingNextPage ? "Loading more tokens…" : hasNextPage ? "" : allTokens.length >= 200 ? "End of token list" : ""}
          </div>
        </div>
      )}
    </section>
  );
}
