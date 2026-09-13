"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { networkNameToSlug } from "@/consts";
import { NavSearchBar } from "@/components/Molecules/NavSearchBar";
import { ThemedScrollArea } from "@/components/ui/scroll-area";
import { useAllPairs } from "@/hooks/useAllPairs";
import { toPickerRow, type PickerRow } from "@/lib/markets/pickerRow";
import { adjustDecimalLength, formatUsd } from "@/utils/number";
import { cn } from "@/lib/utils";

/**
 * Pro's market picker.
 *
 * ## Why this replaced a client-side filter
 *
 * `SearchPopover` held `defaultSpotPairData.pairs` in state and filtered it
 * with `pair.symbol.toLowerCase().includes(value)`. That list is the
 * listing-GATED, paginated one, so the picker could only ever find what one
 * page already held — and a market outside it answered "no results", which
 * reads as *does not exist*. It is the same defect `ExploreSearch` was deleted
 * for; that one was replaced by the ⌘K modal and this one was never migrated.
 *
 * It was worse than un-findable. On RISE all four markets are
 * `verified: false`, so the gated route returns `totalCount: 0` and the picker
 * offered NOTHING on the chain carrying the venue's real volume.
 *
 * `useAllPairs` reads `/api/pairs/all` instead: ungated, ranked by 24h quote
 * volume, filtered by the gateway.
 *
 * ## Ungated is not unlabelled
 *
 * Every row carries its listing state. This venue lets anyone mint a coin
 * called USDC, so a picker that renders an unreviewed market exactly like a
 * listed one is worse than one that hides it — the gate at least made the
 * claim honestly. The chip and its wording come from `lib/search/listing`,
 * shared with the ⌘K modal, because a reader following a market between the
 * two must not be told two different things.
 *
 * Quote TVL is a column for the same reason: it is what separates two markets
 * that share a symbol, and it has to be the quote side, since the base side of
 * a launch is the creator's own seeded mint.
 */

/** One page is the whole venue today (8 markets across two chains) and is a
 * sane ceiling for a dropdown regardless — past this, people type. */
const PAGE_SIZE = 50;

function Figure({ value }: { value: number | null }) {
  // Em-dash, never `$0`: a zero has to mean zero. `PHNX/ETH` has $52.19 of
  // volume against no quote TVL, so this renders on a real market.
  if (value === null) return <span className="text-[color:var(--m-text-secondary-2)]">—</span>;
  return <span>{formatUsd(value)}</span>;
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[color:var(--m-text-secondary-2)]">—</span>;
  const tone =
    value > 0
      ? "text-[color:var(--m-success)]"
      : value < 0
        ? "text-[color:var(--m-error)]"
        : "text-[color:var(--m-text-secondary)]";
  return (
    <span className={tone}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function Row({
  row,
  href,
  chainName,
  onSelect,
}: {
  row: PickerRow;
  href: string;
  chainName: string;
  onSelect?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="grid grid-cols-[minmax(0,2.3fr)_1fr_0.85fr_1fr_1fr] items-center gap-2 border-t border-[color:var(--m-border)] px-3.5 py-2 text-[12px] tabular-nums transition-colors duration-[120ms] hover:bg-[color:var(--m-surface-2)] motion-reduce:transition-none"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <TokenImageIcon
          symbol={row.baseSymbol}
          color=""
          logoURI={undefined}
          size="md"
          chainName={chainName}
        />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="truncate text-[color:var(--m-text-primary)]">{row.symbol}</span>
            {row.unlisted ? (
              <span
                title="Not listed by Iter. Anyone can open a market here — check the address and the quote liquidity before trading."
                className="shrink-0 rounded-[3px] border border-[color:var(--m-accent)]/40 bg-[color:var(--m-accent)]/12 px-1.5 py-px text-[8.5px] uppercase tracking-[0.1em] text-[color:var(--m-accent)]"
              >
                Unlisted
              </span>
            ) : null}
          </span>
        </span>
      </span>
      <span className="text-right text-[color:var(--m-text-primary)]">
        {/* `8`, matching the terminal header's `PriceChange`, NOT the `4` the
            page title uses. Those two already disagree — the title reads 0.993
            where the header reads 0.9925 — and the header is the surface this
            row sits one click from, so a market must not appear to change price
            on being opened. */}
        {row.price === null ? (
          <span className="text-[color:var(--m-text-secondary-2)]">—</span>
        ) : (
          adjustDecimalLength(row.price, 8)
        )}
      </span>
      <span className="text-right">
        <Change value={row.changePct} />
      </span>
      <span className="text-right text-[color:var(--m-text-primary)]">
        <Figure value={row.volumeUsd} />
      </span>
      <span className="text-right text-[color:var(--m-text-primary)]">
        <Figure value={row.quoteTvlUsd} />
      </span>
    </Link>
  );
}

export interface PairPickerProps {
  /** The chain the picker OPENS on — normally the page's. From then on the
   * chain is this component's own state, changed by the dropdown in its
   * header. The slug for row links is derived from that selection, never
   * passed in: the two must not be able to disagree. */
  networkName: string;
  /** Called when a row is chosen, so a popover or sheet can close itself. */
  onSelect?: () => void;
  className?: string;
}

export function PairPicker({ networkName, onSelect, className }: PairPickerProps) {
  const [query, setQuery] = useState("");
  /**
   * The chain being BROWSED, which is not necessarily the chain the page is on.
   *
   * Selecting a chain here re-scopes the list and nothing else — no navigation,
   * no `?chain=` write. Switching the page instead would move the terminal out
   * from under the open dropdown, and would leave `?base=&quote=` naming a
   * market the new chain may not have. Navigation happens when a MARKET is
   * picked, which is the point at which there is somewhere definite to go.
   */
  const [chain, setChain] = useState(networkName);
  // Follow the page if it changes chain underneath this (the sidebar switcher,
  // a link). Without it the picker would keep browsing the chain it opened on.
  useEffect(() => setChain(networkName), [networkName]);

  const slug = networkNameToSlug[chain];
  const { pairs, totalCount, isLoading, isPending, degraded } = useAllPairs(chain, query, PAGE_SIZE);

  const rows = useMemo(() => pairs.map(toPickerRow), [pairs]);

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <div className="flex w-full items-center gap-2.5 border-b border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-3">
        <NavSearchBar placeholder="Search markets" onSearch={setQuery} className="w-full" />
        {/* The chain chip WAS read-only, which put the one control that decides
            which markets exist out of reach of the surface for choosing one.
            Controlled, so it reports rather than navigates — see the state note
            above. No "All chains": a market lives on exactly one chain, and Pro
            is bound to `?chain=`, so a cross-chain scope here would offer rows
            that need a network switch to trade. */}
        <ChainSwitcher
          value={chain}
          onSelect={setChain}
          triggerClassName="h-8 gap-1.5 px-2.5 rounded-full"
          className="shrink-0"
        />
      </div>

      <div className="flex items-baseline justify-between gap-2.5 px-3.5 pb-1.5 pt-2.5">
        <span className="font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--m-text-secondary)]">
          {query.trim() ? "Matches" : "All markets"}
        </span>
        <span className="text-[11px] text-[color:var(--m-text-secondary-2)]">
          {/* One list ranked by volume, with no active/quiet split: every market
              on both chains currently has non-zero volume, so a second group
              would render an empty heading. Add the split when there is a tail
              to put in it. */}
          by 24h volume
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,2.3fr)_1fr_0.85fr_1fr_1fr] gap-2 px-3.5 pb-1.5 font-dm-mono text-[8.5px] uppercase tracking-[0.12em] text-[color:var(--m-text-secondary-2)]">
        <span>Market</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Quote TVL</span>
      </div>

      <ThemedScrollArea className="h-72 w-full overflow-y-auto">
        {isLoading ? (
          <div className="px-3.5 py-10 text-center text-[12px] text-[color:var(--m-text-secondary-2)]">
            Loading markets…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3.5 py-10 text-center text-[12px] text-[color:var(--m-text-secondary-2)]">
            {/* Names the chain, so "no markets" cannot be misread as "no such
                market anywhere" — the same rule the ⌘K modal's empty state
                follows. */}
            {query.trim()
              ? `No market matching “${query.trim()}” on ${chain}`
              : degraded
                ? `${chain} has no LISTED markets, and this gateway cannot show unlisted ones yet.`
                : `No markets on ${chain}`}
          </div>
        ) : (
          rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              chainName={chain}
              onSelect={onSelect}
              href={`/trade/pro?chain=${slug}&base=${encodeURIComponent(row.baseSymbol)}&quote=${encodeURIComponent(row.quoteSymbol)}`}
            />
          ))
        )}
      </ThemedScrollArea>

      <div className="border-t border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-2 text-[10.5px] text-[color:var(--m-text-secondary-2)]">
        {isPending
          ? "Searching…"
          : degraded
            ? `Listed markets only — this gateway predates the full market list.`
            : `${totalCount} ${totalCount === 1 ? "market" : "markets"} on ${chain}`}
      </div>
    </div>
  );
}
