"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_THRESHOLD_USD } from "@/lib/liquidity/thresholdDefault";
import { ExploreShelves } from "@/components/Explore/ExploreShelves";
import { AuctionsPanel } from "@/components/Explore/AuctionsPanel";
import { TokensTable } from "@/components/Explore/TokensTable";
import { PairsTable } from "@/components/Explore/PairsTable";
import { PoolSearchButton, PoolsTable } from "@/components/Explore/PoolsTable";
import { TransactionsTable } from "@/components/Explore/TransactionsTable";
import { LaunchesTable } from "@/components/Explore/LaunchesTable";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useMultichainPairs } from "@/hooks/useMultichainPairs";
import type { SpotPair } from "@/types";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, Flame, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { TokenRanking } from "@/hooks/useTokens";
import { buildExploreSectionUrl, buildPageUrl, type ExploreSection } from "@/lib/routing/chainParams";

/**
 * Token tags — a category strip over the Tokens table.
 *
 * Every one is a REAL gateway ranking route, so switching a tag re-asks the
 * server for a different set of tokens rather than relabelling a client-side
 * sort of the rows already here. That distinction is why the column sorts and
 * these can coexist: the tag chooses which tokens, the column chooses their
 * order.
 *
 * It also gives "Popular" — the operator-defined trending list — somewhere to
 * live again; it was the one ranking with no equivalent column and it became
 * unreachable when the old ranking pills came out.
 */
/**
 * Popular is `top-volume`, not `trending`.
 *
 * Popular means most traded, highest volume first — and `top-volume` is exactly
 * that, ordered by `dayVolumeUSD` with no floor.
 *
 * `trending` is a different question wearing the same label: an operator-set
 * JUDGEMENT (`admin.trendingConfig` picks velocity, volumeChange, gainerFloor or
 * volume) and every one of its strategies applies a `minVolumeUsd` floor, so it
 * answers "what is waking up" rather than "what is busiest". On this venue that
 * floor is above the entire day's volume, so the ranking returned NOTHING and the
 * table fell back to an unranked list — a Popular tab showing an arbitrary order,
 * which is the state that made the missing chain on those rows visible.
 *
 * The operator's trending definition is now unreachable from this strip. That is
 * a real loss and worth naming: bringing it back means its own tab, not
 * borrowing this one's label.
 */
const TOKEN_TAGS: { key: TokenRanking; label: string; Icon: typeof Flame }[] = [
  { key: "top-volume", label: "Popular", Icon: Flame },
  { key: "top-marketcap", label: "Market cap", Icon: BarChart3 },
  { key: "top-gainer", label: "Gainers", Icon: TrendingUp },
  { key: "top-loser", label: "Losers", Icon: TrendingDown },
  { key: "new", label: "New", Icon: Sparkles },
];

/**
 * Explore — the market reading room (Explore spec in apps/web/CLAUDE.md,
 * authoritative; replaces the old carousel + token-cards layout, 2026-07-28).
 *
 * Read left, act right: search + shelves + the market table inform; the
 * Action Dock on the right rail executes. Inline row chips re-bind the dock
 * without navigating; row clicks open profiles. A live market tape across the
 * top is phase 2 (the Landing MarketTape is static pre-launch data, wrong
 * source for an app surface).
 */
export function HomeDesktopPage({
  /** The operator's listing threshold, read server-side. Defaulted so the component stays
   * usable from anywhere; the explore page always supplies the live value. */
  thresholdUsd = DEFAULT_THRESHOLD_USD,
  initialDirectoryTab,
}: {
  thresholdUsd?: number;
  initialDirectoryTab?: "tokens" | "auction" | "launches" | "pools" | "transactions";
} = {}) {
  const [directoryTab] = useState<"tokens" | "auction" | "launches" | "pools" | "transactions">(initialDirectoryTab ?? "tokens");
  const { displayNetworkName, displayNetworkSlug, defaultSpotPairData, chainFilter } =
    useMarketPageContext();
  // Owned here so the field can live in the panel header beside the chain
  // switcher; the table consumes it as a controlled prop.
  const [tokenFilter, setTokenFilter] = useState("");
  // Popular is the primary discovery view. Its rows are fetched from the
  // trending ranking and the table orders them by the most useful discovery
  // signal: 24h volume, highest first.
  const [tokenTag, setTokenTag] = useState<TokenRanking>("trending");
  const [poolSearchOpen, setPoolSearchOpen] = useState(false);
  const [poolSearch, setPoolSearch] = useState("");
  const [transactionSearchOpen, setTransactionSearchOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const reduceMotion = useReducedMotion();

  /**
   * Pre-graduation markets, fetched ONCE here and handed to both consumers.
   *
   * The shelf and the Launches tab must agree about what is unlisted — two
   * independent fetches would eventually disagree at exactly the moment a
   * market graduates, which is the moment anyone is looking.
   */
  // Pre-graduation markets, across every chain the scope allows. These feed
  // the Launches tab and the Markets count, both of which named one chain.
  const { data: unlistedData } = useMultichainPairs(
    20,
    1,
    "unlisted",
    chainFilter ? [chainFilter] : undefined,
  );
  const unlistedPairs = (unlistedData?.pairs ?? []) as SpotPair[];
  const listedPairs = (defaultSpotPairData?.pairs ?? []) as SpotPair[];
  const trackedPairs = [...listedPairs, ...unlistedPairs];
  const volume24h = trackedPairs.reduce(
    (sum, pair) => sum + pair.dayBaseVolumeUSD + pair.dayQuoteVolumeUSD,
    0,
  );
  const trackedTvl = trackedPairs.reduce(
    (sum, pair) => sum + pair.dayBaseTvlUSD + pair.dayQuoteTvlUSD,
    0,
  );
  const launchedCount = new Set(
    unlistedPairs.filter((pair) => pair.base?.creator).map((pair) => pair.base.id),
  ).size;
  // An em-dash, never `$0`. A quiet chain and an unreachable feed produce the
  // same zero here, and `$0` states the first as a fact -- the rule the status
  // bar's chips already follow.
  const compactUSD = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "—";
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${Math.round(value)}`;
  };
  const compactCount = (value: number) => (value > 0 ? value.toLocaleString() : "—");

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col px-6 pb-16 pt-9">
      <div className="mb-8 grid grid-cols-2 border-y border-[color:var(--m-border)] py-4 sm:grid-cols-4">
        {[
          { label: "1D volume", value: compactUSD(volume24h) },
          { label: "Tracked TVL", value: compactUSD(trackedTvl) },
          { label: "Markets", value: compactCount((defaultSpotPairData?.totalCount ?? listedPairs.length) + unlistedPairs.length) },
          { label: "Launched tokens", value: compactCount(launchedCount) },
        ].map((metric, index) => (
          <div
            key={metric.label}
            className={`px-4 ${index > 0 ? "border-l border-[color:var(--m-border)]" : ""}`}
          >
            <p className="font-dm-mono text-[10px] uppercase tracking-[0.13em] text-[color:var(--m-text-secondary)]">
              {metric.label}
            </p>
            <p className="mt-2 text-xl font-medium tracking-[-0.035em] text-[color:var(--m-text-primary)] sm:text-2xl">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
      {/* Search moved to the AppShell top bar (Coinbase layout) — this page
          starts with the token directory, followed by market context.

          "Featured tokens" and "LPs to earn" used to sit here and were removed
          on 2026-08-12. Both were `listedPairs.slice(0, n)` — the head of the
          same list the directory below already ranks, and the shelves re-sort a
          third time — so a chain with a handful of markets showed the same
          assets three times before anything sortable appeared. "Curated" and
          "configured by the admin team" described a curation layer that does
          not exist. LP yield belongs in the table as a column, not as a rail. */}
      <div className="flex min-w-0 flex-col gap-6">
          {/* Shelves ABOVE the directory. They are the opinionated read -- top
              movers, depth leaders, just listed -- and the table is the place
              you go when none of them answered the question. Underneath a table
              that paginates, they were below the fold on every tab. */}
          <ExploreShelves />
          <section id="explore-directory" aria-label="Explore directory" className="min-w-0 scroll-mt-24">
            {/* A real tablist. These were bare buttons carrying `aria-selected`,
                which is invalid without a tab role -- a screen reader got four
                buttons with a state it could not interpret, and no link between
                a tab and the panel it controls. */}
            {/* Pills left, chrome right, and the whole row lives INSIDE the card
                with the table it acts on -- a chain switcher and a search field
                floating above the panel read as page furniture rather than as
                controls for this list. */}
            {/* NOT `overflow-hidden`. The ChainSwitcher in the toolbar below opens
                an absolutely-positioned panel, and this card would be its nearest
                clipping ancestor — so the dropdown was cut off at the card's edge.
                That reads as a z-index bug and is not one: it already sits at z-50
                inside its own `relative` box, and no z-index can escape a clip.

                Nothing here needs the clip. The card carries `p-5`, so no child
                ever reaches the rounded corners, and each table scrolls itself
                through its own `overflow-x-auto`. */}
            <div
              id="explore-panel"
              role="tabpanel"
              aria-labelledby={`explore-tab-${directoryTab}`}
              className="rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5 shadow-[0_1px_2px_rgba(20,40,60,.04)] sm:p-6"
            >
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Explore directory" className="inline-flex flex-wrap items-center gap-1 self-start rounded-full bg-[color:var(--m-surface-2)] p-1">
                {([
                  ["tokens", "Tokens", "tokens"],
                  ["auction", "Auction", "auctions"],
                  ["launches", "Launches", "launches"],
                  ["pools", "Pools", "pools"],
                  ["transactions", "Transactions", "transactions"],
                ] as const).map(([key, label, section]) => (
                  <Link
                    key={key}
                    href={buildExploreSectionUrl(section as ExploreSection)}
                    role="tab"
                    id={`explore-tab-${key}`}
                    aria-controls="explore-panel"
                    aria-selected={directoryTab === key}
                    tabIndex={directoryTab === key ? 0 : -1}
                    className={`relative rounded-full px-5 py-2.5 text-base tracking-[-0.015em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--m-surface-2)] ${
                      directoryTab === key
                        ? "font-medium text-[color:var(--m-text-primary-inverse)]"
                        : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
                    }`}
                  >
                    {/* One pill shared across the tabs by layoutId, so selecting a
                        tab slides it there instead of swapping two backgrounds.
                        Behind the label, hence the z-order on the text. */}
                    {directoryTab === key && (
                      <motion.span
                        layoutId="explore-tab-pill"
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-[color:var(--m-primary)] shadow-[0_2px_8px_color-mix(in_srgb,var(--m-primary)_28%,transparent)]"
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 420, damping: 34 }
                        }
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </Link>
                ))}
              </div>
              {directoryTab === "pools" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={buildPageUrl("pool", { slug: displayNetworkSlug, provide: true })}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--m-text-primary)] px-4 text-sm font-medium text-[color:var(--m-surface)] transition-transform hover:-translate-y-px"
                  >
                    <span aria-hidden className="text-lg leading-none">+</span>
                    New position
                  </Link>
                  <ChainSwitcher />
                  <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 text-sm text-[color:var(--m-text-primary)]">
                    Protocol <span aria-hidden className="text-[color:var(--m-text-secondary)]">⌄</span>
                  </button>
                  {poolSearchOpen && (
                    <motion.label
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 180, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 360, damping: 30 }}
                      className="flex h-10 items-center gap-2 overflow-hidden rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 text-sm text-[color:var(--m-text-secondary)] focus-within:border-[color:var(--m-primary)]"
                    >
                      <span aria-hidden>⌕</span>
                      <input
                        autoFocus
                        type="search"
                        value={poolSearch}
                        onChange={(event) => setPoolSearch(event.target.value)}
                        placeholder="filter pools"
                        aria-label="Filter pools"
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
                      />
                    </motion.label>
                  )}
                  <PoolSearchButton open={poolSearchOpen} onClick={() => setPoolSearchOpen((open) => !open)} />
                </div>
              )}
              {directoryTab !== "pools" && directoryTab !== "tokens" && directoryTab !== "launches" && directoryTab !== "auction" && directoryTab !== "transactions" && <ChainSwitcher />}
              {directoryTab === "transactions" && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* `allChains`, because this tab reads the AGGREGATOR.
                      Without it the switcher writes only the display chain
                      and never `chainFilter` — the one thing
                      `TransactionsTable` filters on. So the trigger showed
                      the display chain's mark (`showingAll` is false when
                      `allChains` is) while the tape below listed every
                      chain's fills, and picking a chain visibly did nothing.

                      This is the tab the Tokens switcher's comment warned
                      about: it moved to the aggregator on 2026-09-04 and its
                      control was left behind. */}
                  <ChainSwitcher allChains />
                  {transactionSearchOpen && (
                    <motion.label
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 208, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 360, damping: 30 }}
                      className="flex h-10 items-center gap-2 overflow-hidden rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 text-sm text-[color:var(--m-text-secondary)] focus-within:border-[color:var(--m-primary)]"
                    >
                      <Search aria-hidden className="h-4 w-4 shrink-0" />
                      <input
                        autoFocus
                        type="search"
                        value={transactionSearch}
                        onChange={(event) => setTransactionSearch(event.target.value)}
                        placeholder="Search transactions"
                        aria-label="Search transactions"
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
                      />
                    </motion.label>
                  )}
                  <button
                    type="button"
                    aria-label={transactionSearchOpen ? "Close transaction search" : "Search transactions"}
                    aria-pressed={transactionSearchOpen}
                    onClick={() => setTransactionSearchOpen((open) => !open)}
                    className={`grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] ${transactionSearchOpen ? "text-[color:var(--m-text-primary)]" : ""}`}
                  >
                    <Search aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              )}
              </div>
              {/* Below the tabs, not beside them: these act on the table the tab
                  selected, so they read as belonging to it rather than competing
                  with the tab strip for the same row.

                  Tokens only — on Pools or Transactions they would sit above a
                  list they do not filter. The shell's own search and its sidebar
                  chain switcher still cover every tab. */}
              {directoryTab === "tokens" && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Token tags. Each is a real gateway ranking route, not a label
                      over a client-side sort -- which is also what brings back
                      "Popular", the operator-defined trending list that had no
                      home after the ranking pills came out. */}
                  <div role="tablist" aria-label="Token tags" className="inline-flex flex-wrap items-center gap-1.5">
                    {TOKEN_TAGS.map(({ key, label, Icon }) => {
                      const active = tokenTag === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTokenTag(key)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--m-surface)] ${
                            active
                              ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)]/10 font-medium text-[color:var(--m-text-primary)]"
                              : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] hover:border-[color:var(--m-border-strong,var(--m-text-secondary-2))] hover:text-[color:var(--m-text-primary)]"
                          }`}
                        >
                          <Icon aria-hidden className="h-4 w-4 shrink-0" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                  {/* Cross-chain, and the tabs that honour it are TokensTable,
                      the shelves and Transactions — all of which read
                      `chainFilter`. Auction, Launches and Pools are still
                      single-chain reads off `displayNetworkName`, so "All chains"
                      there is a scope nothing widens.

                      Transactions was in that second list until it quietly moved
                      to the aggregator on 2026-09-04 and this comment did not
                      move with it. It then read EVERY chain while the switcher
                      beside it offered a choice the list ignored. */}
                  <ChainSwitcher allChains />
                  <label className="flex w-[200px] items-center gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3.5 py-2.5 text-sm text-[color:var(--m-text-secondary)] focus-within:border-[color:var(--m-primary)]">
                    <span aria-hidden>⌕</span>
                    <input
                      type="search"
                      value={tokenFilter}
                      onChange={(event) => setTokenFilter(event.target.value)}
                      placeholder="Filter tokens"
                      aria-label="Filter tokens"
                      className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
                    />
                  </label>
                  </div>
                </div>
              )}
            </div>
              {/* Source comes from the tab, never from a toggle inside the panel:
                  Launches IS source=launched, and two controls for one decision
                  is how they end up disagreeing. */}
              {/* trackedPairs, not unlistedPairs — the same fix as Pools below,
                  for the same reason. `pairs` feeds TokensTable's FALLBACK, used
                  when the gateway's token-ranking route returns nothing (see the
                  long note there: an indexer can expose /pairs/unlisted before
                  the ranking routes, and rankings like Popular apply a
                  minVolumeUsd floor this testnet is entirely below). Handed only
                  the unlisted pairs, that fallback had nothing to fall back TO
                  the moment every market was listed — so the Tokens tab read
                  "No tokens match this view" while the shelves directly above it
                  listed four markets. `source` still does the gating inside. */}
              {directoryTab === "tokens" && <TokensTable pairs={trackedPairs} thresholdUsd={thresholdUsd} initialSource="all" search={tokenFilter} ranking={tokenTag} />}
              {/* Auction sits before Launches because it is the earlier stage:
                  a presale opens, settles, and only then becomes a market. */}
              {directoryTab === "auction" && <AuctionsPanel />}
              {directoryTab === "launches" && <LaunchesTable pairs={unlistedPairs} thresholdUsd={thresholdUsd} />}
              {/* trackedPairs, not listedPairs: the Markets stat in this panel's
                  own header already counts listed + unlisted, so gating the table
                  alone made it claim there were no pools on a chain it had just
                  said had seven. PoolsTable ranks the listed ones first and chips
                  the rest. */}
              {directoryTab === "pools" && <PoolsTable pairs={trackedPairs} search={poolSearch} />}
              {directoryTab === "transactions" && (
                <TransactionsTable search={transactionSearch} chainFilter={chainFilter} />
              )}
            </div>
          </section>
      </div>
    </div>
  );
}
