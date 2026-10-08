"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { TokenArt } from "./TokenArt";
import { CardRow, CardTitle } from "./cardParts";
import { LadderCornerPill, LadderProgress } from "./LadderStatus";
import { ARRIVAL_STAGGER_MS } from "@/lib/launch/arrivals";
import { hoistRecentlyTraded } from "@/lib/launch/traded";
import { KingOfTheHill } from "@/components/Launch/KingOfTheHill";
import { useRecentlyTraded } from "@/hooks/useRecentlyTraded";
import { useLaunchAnnouncements } from "@/hooks/useLaunchAnnouncements";
import { useArrivals } from "@/hooks/useArrivals";
import { useInfiniteTokens } from "@/hooks/useTokens";
import { useQuoteOptions } from "@/hooks/useQuoteOptions";
import {
  LaunchControls,
  type LaunchTab,
  type LaunchView,
} from "@/components/Launch/LaunchControls";
import {
  applyClientSort,
  DEFAULT_LAUNCH_SORT,
  hoistReorders,
  launchSort,
  type LaunchSort,
} from "@/lib/launch/sorts";
import { formatMarketCap } from "@/utils/number";
import { cn } from "@/lib/utils";
import type { SpotToken } from "@/types";

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

function LaunchCard({
  token,
  thresholdUsd,
  /** Place in the entering batch, or undefined for a card that was already here. */
  arrivalIndex,
  /** This coin traded within the window, so it was lifted to the front. */
  traded = false,
  /** The list layout: one row per coin instead of a tile. */
  dense = false,
}: {
  token: SpotToken;
  thresholdUsd?: number;
  arrivalIndex?: number;
  traded?: boolean;
  dense?: boolean;
}) {
  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext();
  // Ladder coins show their ladder (design C+); coins from the previous
  // generator keep the listing bar.
  const ladder = token.ladder ?? null;
  const pct = ladder ? null : graduationPct(token, thresholdUsd);
  const arriving = arrivalIndex !== undefined;
  const change = token.dayPriceDifferencePercentage;
  const hasChange = typeof change === "number" && Number.isFinite(change);
  // A sold-out or armed ladder opens straight at the coin page's graduation
  // panel. It goes to /token directly: the /explore/tokens redirect would drop
  // the #graduation fragment on a client navigation.
  const readyToGraduate = ladder?.state === "soldOut" || ladder?.state === "armed";
  const href = readyToGraduate
    ? `/token/${encodeURIComponent(token.id)}?chain=${encodeURIComponent(displayNetworkSlug)}#graduation`
    : `/explore/tokens/${encodeURIComponent(token.symbol)}?chain=${encodeURIComponent(displayNetworkSlug)}`;

  return (
    <Link
      href={href}
      className={cn(
        "group rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] transition-colors hover:border-[color:var(--m-text-secondary-2)]",
        dense
          ? "flex items-center gap-3 p-2.5"
          : "flex flex-col gap-3 p-4",
        arriving && "launch-arrive launch-arrive-mark",
      )}
      /* The stagger is an inline delay rather than N classes: the batch is
         capped at four, so this is four values, not a scale to maintain. */
      style={arriving ? { animationDelay: `${arrivalIndex * ARRIVAL_STAGGER_MS}ms` } : undefined}
    >
      {/* The SAME art /create previews — see components/Launch/TokenArt. That
          preview captions itself "This is the card Explore renders once it
          deploys", and until both mounted one component that sentence was
          simply false: the preview drew a square hero and this drew a 40px
          avatar in a row of stats. */}
      {/* The list row keeps the same art component, just not as a hero — one
          component, so the /create preview's promise that this is the card
          Explore renders stays true in both layouts. */}
      <span className={cn("relative", dense && "h-10 w-10 shrink-0 overflow-hidden rounded-lg")}>
        <TokenArt
          symbol={token.symbol}
          logoURI={token.logoURI}
          chainName={displayNetworkName}
        />
        {ladder && !dense && <LadderCornerPill ladder={ladder} />}
      </span>

      <div className={cn("min-w-0 flex-1", dense ? "" : "px-0.5 pb-0.5 pt-1")}>
        <span className="flex items-baseline gap-2">
          <CardTitle symbol={token.symbol} name={token.name || token.symbol} />
          {/* Motion is never the only channel: anyone who blinked, or who asked
              for reduced motion, still gets told which coin is the new one. */}
          {arriving ? (
            <span className="ml-auto shrink-0 rounded-full bg-[color-mix(in_srgb,var(--m-success)_16%,transparent)] px-1.5 py-0.5 font-dm-mono text-[9.5px] tracking-[0.09em] text-[color:var(--m-success)] uppercase">
              new
            </span>
          ) : traded ? (
            /* A coin at the top is there for a REASON, and the reason has to be
               readable. Without this the grid silently disagrees with the tab
               above it — "Trending" showing an order trending did not choose —
               and a reader cannot tell a hoist from a ranking change.

               Never both chips: a coin that just launched and immediately
               traded is still, to a reader, the new one. */
            <span className="ml-auto shrink-0 rounded-full bg-[color-mix(in_srgb,var(--m-primary)_16%,transparent)] px-1.5 py-0.5 font-dm-mono text-[9.5px] tracking-[0.09em] text-[color:var(--m-primary)] uppercase">
              traded
            </span>
          ) : null}
        </span>

        <dl className="font-mono text-[11.5px]">
          {/* Read from spotTokens.marketCap, a generated column. Never price ×
              supply here -- that second source of truth is what the column was
              introduced to delete. An absent value is a dash, never $0. */}
          <CardRow k="Market cap">
            <span className="flex items-baseline justify-end gap-2">
              <span className="tabular-nums text-[var(--m-text-primary)]">
                {formatMarketCap(token.marketCap)}
              </span>
              {hasChange && (
                <span
                  className={cn(
                    "tabular-nums text-[10.5px]",
                    change >= 0
                      ? "text-[color:var(--m-success)]"
                      : "text-[color:var(--m-error)]",
                  )}
                >
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              )}
            </span>
          </CardRow>

          {pct !== null && (
            <CardRow k="To listing" v={`${Math.round(pct)}%`} />
          )}
        </dl>

        {ladder && <LadderProgress ladder={ladder} />}

        {pct !== null && (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]">
            <span
              className="block h-full rounded-full bg-[color:var(--m-primary)] transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
      </div>
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
  const [tab, setTab] = useState<LaunchTab>("all");
  const [sort, setSort] = useState<LaunchSort>(DEFAULT_LAUNCH_SORT);
  const [quote, setQuote] = useState<string | null>(null);
  const [view, setView] = useState<LaunchView>("grid");
  const selected = launchSort(sort);

  /* The venue's own quote list, not a hardcoded one — the same read the launch
     form uses to decide what a coin may list against. */
  const { options: quotes } = useQuoteOptions(displayNetworkName);

  const filtered = tab !== "all" || quote !== null;

  const params = useMemo(
    () => ({
      ...(quote ? { quote } : {}),
      ...(tab !== "all" ? { status: tab } : {}),
    }),
    [quote, tab],
  );

  const { data, isLoading, error, refetch } = useInfiniteTokens(
    displayNetworkName,
    200,
    selected.ranking,
    "launched",
    params,
  );

  /*
   * A coin deployed anywhere on the venue is fetched now, not on the next
   * mount or tab focus.
   *
   * This grid had no live path at all: the broker announced a launch to the
   * creator's own wallet room and to nobody else, so every other reader waited
   * for an incidental refetch — minutes, on a quiet venue — and the arrival
   * animation then played for something that had long since happened.
   *
   * The refetch is all that is needed. `useArrivals` below is a set difference
   * over renders, so the coin animates in the moment the fetch returns it, and
   * the card is drawn from real rows rather than from the frame, which carries
   * a name and a symbol but none of the numbers a card shows.
   */
  useLaunchAnnouncements(displayNetworkName, refetch);
  const tokens = useMemo(() => {
    const rows = (data?.pages.flatMap((page) => page.tokens) ?? []) as SpotToken[];
    // Only "Progress" is ordered here, and only because it is monotonic with
    // the market-cap ranking that fetched these rows. See `applyClientSort`.
    return applyClientSort(rows, sort);
  }, [data, sort]);

  /*
   * A coin that just traded goes to the front, whichever tab is showing.
   *
   * The ask this answers: an arrival is rare and a trade is not, so a directory
   * ordered purely by market cap or by age can be completely still while the
   * venue is busy. Lifting what just traded makes the page report the thing a
   * reader came to see — and it is a REORDER, not an insert, so it needs its
   * own signal rather than reusing the arrival's.
   *
   * Held while the pointer is over the grid. Cards moving under a cursor is the
   * hazard the arrival spec calls "never shove", and a reorder is the worst
   * case of it: the card you were about to click becomes another one. The order
   * settles the moment the pointer leaves.
   */
  const tradedAt = useRecentlyTraded(displayNetworkName);
  // The order on screen when the pointer arrived; null while nobody is reading.
  const [held, setHeld] = useState<SpotToken[] | null>(null);
  const hoisted = useMemo(
    () =>
      hoistRecentlyTraded<SpotToken>(tokens, tradedAt, Date.now(), {
        // The sort decides whether a trade moves a card or only marks it.
        reorder: hoistReorders(sort),
      }),
    [tokens, tradedAt, sort],
  );
  const shown = held ?? hoisted.ordered;

  /* Reset on the VIEW, not the network: the three tabs are three different
     questions and their id sets barely overlap. See `useArrivals`. */
  const arrivals = useArrivals(
    useMemo(() => shown.map((token) => token.id), [shown]),
    `${displayNetworkName}:${sort}:${tab}:${quote ?? "all"}`,
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
        <LaunchControls
          tab={tab}
          onTab={setTab}
          sort={sort}
          onSort={setSort}
          quote={quote}
          onQuote={setQuote}
          view={view}
          onView={setView}
          quotes={quotes}
        />
      </header>

      {/*
        The race, above the directory.
        The grid answers "what exists"; this answers "what is about to happen",
        which is the question a launch page is opened with — and the one a
        ranked grid cannot answer, because its leader looks like every other
        card in it. It reads the tokens already fetched, so it costs no request.

        Hidden once a filter is on. It is "the race to listing", and on the
        Graduated tab that race is already over — a leaderboard of coins that
        have finished would contradict its own heading. Narrowed by quote it is
        a different claim again: the leader of one quote's coins is not the
        venue's leader, which is what this section says it shows.
      */}
      {!isLoading && !error && !filtered && tokens.length > 0 && (
        <KingOfTheHill tokens={tokens} thresholdUsd={thresholdUsd} />
      )}

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
        /* A filtered empty result is NOT the same statement as an empty venue.
           Saying "nothing has launched" to someone who just picked Graduated
           and a quote is a false claim about the chain, and it hides the fact
           that their own filter is what emptied the page. */
        <p className="py-16 text-center text-sm text-[color:var(--m-text-secondary)]">
          {filtered
            ? "No launches match these filters yet."
            : `Nothing has launched on ${displayNetworkName} yet.`}
        </p>
      ) : (
        <div
          className={cn(
            "gap-3",
            view === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col",
          )}
          onPointerEnter={() => setHeld(shown)}
          onPointerLeave={() => setHeld(null)}
        >
          {shown.map((token) => (
            <LaunchCard
              key={token.id}
              token={token}
              thresholdUsd={thresholdUsd}
              arrivalIndex={arrivals.get(token.id)}
              traded={hoisted.lifted.has(token.id)}
              dense={view === "list"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
