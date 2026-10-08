"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Search, X } from "lucide-react";
import { PairImageIcon } from "@/components/Atoms/PairImageIcon";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { StarButton } from "@/components/Organisms/StarButton";
import { networkNameToSlug } from "@/consts";
import { ThemedScrollArea } from "@/components/ui/scroll-area";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import {
  isAddressQuery,
  useFindPairs,
  useListedPairs,
  usePairsByIds,
  useTrendingPairs,
} from "@/hooks/usePickerPairs";
import { useRecentMarkets } from "@/lib/markets/recentMarkets";
import { ageLabel, proHref, shortAddress, toPickerRow, type PickerRow } from "@/lib/markets/pickerRow";
import { tokenColor } from "@/lib/swap/tokens";
import { adjustDecimalLength, formatUsd } from "@/utils/number";
import { cn } from "@/lib/utils";
import type { SpotPair } from "@/types";

/**
 * Pro's market picker, built for a launchpad that opens ~100k pairs a day.
 *
 * ## It is not a directory any more
 *
 * It used to list every market on the chain by 24h volume and search them with
 * `ILIKE '%q%'`. At millions of pairs that query scanned the table on every
 * keystroke, and a name like "PEPE" returned hundreds of identical rows. Now it
 * holds four bounded lists and a search that answers two different questions:
 *
 *  - **Favorites**: the wallet's watchlist (identity-service, keyed by pair
 *    address, so it follows the wallet across devices). Starred from any row.
 *  - **Recent**: markets this browser opened on this network
 *    (`lib/markets/recentMarkets`), including ones reached by a pair link.
 *  - **Listed**: graduated markets, by 24h volume.
 *  - **Trending**: launches that traded in the last 24h, by 24h volume.
 *  - **Search**: a NAME finds active markets (listed, or traded in 24h) by
 *    prefix; an ADDRESS (coin or pair) finds any market exactly. The quiet tail
 *    is reached by address or by its pair link, never by browsing.
 *
 * ## Ungated is not unlabelled
 *
 * Every launch row carries an Unlisted chip (same wording as the ⌘K modal),
 * and every row shows the base token's short address and its age, because
 * those are what tell two markets with the same symbol apart.
 *
 * ## One chain
 *
 * Pro is bound to `?chain=`, so the picker browses one network at a time; the
 * chip in its header re-scopes the list without navigating. Navigation happens
 * when a market is picked.
 */

type Tab = "favorites" | "recent" | "listed" | "trending";

const TABS: { id: Tab; label: string }[] = [
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
  { id: "listed", label: "Listed" },
  { id: "trending", label: "Trending" },
];

function Figure({ value }: { value: number | null }) {
  // Em-dash, never `$0`: a zero has to mean zero.
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

function UnlistedChip() {
  return (
    <span
      title="Not listed by Rate. Anyone can open a market here — check the address and the quote liquidity before trading."
      className="shrink-0 rounded-[3px] border border-[color:var(--m-accent)]/40 bg-[color:var(--m-accent)]/12 px-1.5 py-px text-[8.5px] uppercase tracking-[0.1em] text-[color:var(--m-accent)]"
    >
      Unlisted
    </span>
  );
}

/** The line under a market's name: base address and age. */
function Subline({ row, now }: { row: PickerRow; now: number }) {
  const parts = [shortAddress(row.baseAddress), ageLabel(row.listedAt, now)].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className="truncate font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">
      {parts.join(" · ")}
    </span>
  );
}

const DESKTOP_GRID = "grid-cols-[22px_minmax(0,2.3fr)_1fr_0.85fr_1fr_1fr]";
const DESKTOP_GRID_NO_STAR = "grid-cols-[minmax(0,2.3fr)_1fr_0.85fr_1fr_1fr]";

export function Row({
  row,
  href,
  chainName,
  onSelect,
  star,
  now = Math.floor(Date.now() / 1000),
}: {
  row: PickerRow;
  href: string;
  chainName: string;
  onSelect?: () => void;
  /** The favorite control, rendered in its own column ahead of the market. */
  star?: ReactNode;
  now?: number;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-2 border-t border-[color:var(--m-border)] px-3.5 text-[12px] tabular-nums transition-colors duration-[120ms] hover:bg-[color:var(--m-surface-2)] motion-reduce:transition-none",
        star ? DESKTOP_GRID : DESKTOP_GRID_NO_STAR,
      )}
    >
      {star ? <span className="flex items-center">{star}</span> : null}
      {/* The link covers the market columns only, so the star beside it is
          its own control rather than a button nested inside a link. */}
      <Link
        href={href}
        onClick={onSelect}
        className="col-span-5 grid grid-cols-subgrid items-center gap-2 py-2"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <PairImageIcon
            base={row.baseSymbol}
            quote={row.quoteSymbol}
            baseLogoURI={row.baseLogoURI}
            quoteLogoURI={row.quoteLogoURI}
            baseColor={tokenColor(row.baseSymbol)}
            quoteColor={tokenColor(row.quoteSymbol)}
            chainName={chainName}
            className="h-8 w-8"
          />
          <span className="flex min-w-0 flex-col gap-px">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="truncate text-[color:var(--m-text-primary)]">{row.symbol}</span>
              {row.unlisted ? <UnlistedChip /> : null}
            </span>
            <Subline row={row} now={now} />
          </span>
        </span>
        <span className="text-right text-[color:var(--m-text-primary)]">
          {/* `8`, matching the terminal header, so a market does not appear to
              change price on being opened. */}
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
    </div>
  );
}

/** The phone row: name and subline, price and change, star at the end. */
function SheetRow({
  row,
  href,
  chainName,
  onSelect,
  star,
  now,
}: {
  row: PickerRow;
  href: string;
  chainName: string;
  onSelect?: () => void;
  star: ReactNode;
  now: number;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-2 border-t border-[color:var(--m-border)] px-4">
      <Link href={href} onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5">
        <PairImageIcon
          base={row.baseSymbol}
          quote={row.quoteSymbol}
          baseLogoURI={row.baseLogoURI}
          quoteLogoURI={row.quoteLogoURI}
          baseColor={tokenColor(row.baseSymbol)}
          quoteColor={tokenColor(row.quoteSymbol)}
          chainName={chainName}
          className="h-8 w-8"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <span className="truncate text-[color:var(--m-text-primary)]">{row.symbol}</span>
            {row.unlisted ? <UnlistedChip /> : null}
          </span>
          <Subline row={row} now={now} />
        </span>
        <span className="flex shrink-0 flex-col items-end font-dm-mono text-[12px] tabular-nums">
          <span className="text-[color:var(--m-text-primary)]">
            {row.price === null ? "—" : adjustDecimalLength(row.price, 8)}
          </span>
          <span className="text-[11px]">
            <Change value={row.changePct} />
          </span>
        </span>
      </Link>
      {star}
    </div>
  );
}

/** The star, sized as a 44px touch target on phones and with a padded hit area on desktop. */
function RowStar({ row, variant }: { row: PickerRow; variant: "popover" | "sheet" }) {
  return (
    <span
      className={cn(
        "relative flex items-center justify-center",
        variant === "sheet" ? "h-11 w-11 -mr-2" : "h-[22px] w-[22px] before:absolute before:-inset-2 before:content-['']",
      )}
    >
      <StarButton id={row.id} symbol={row.symbol} option="spot" size={variant === "sheet" ? 18 : 14} />
    </span>
  );
}

function GroupLabel({ label, aside }: { label: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 px-3.5 pb-1.5 pt-3">
      <span className="font-dm-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--m-text-secondary)]">
        {label}
      </span>
      {aside ? <span className="text-[11px] text-[color:var(--m-text-secondary-2)]">{aside}</span> : null}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[36ch] px-5 py-10 text-center text-[12.5px] leading-relaxed text-[color:var(--m-text-secondary-2)]">
      {children}
    </div>
  );
}

export interface PairPickerProps {
  /** The chain the picker OPENS on — normally the page's. From then on the
   * chain is this component's own state, changed by the chip in its header. */
  networkName: string;
  /** Called when a row is chosen, so a popover or sheet can close itself. */
  onSelect?: () => void;
  className?: string;
  /** `sheet` is the phone layout: compact rows, star at the end, a Paste button. */
  variant?: "popover" | "sheet";
}

export function PairPicker({ networkName, onSelect, className, variant = "popover" }: PairPickerProps) {
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState(networkName);
  useEffect(() => setChain(networkName), [networkName]);
  const slug = networkNameToSlug[chain];
  const inputRef = useRef<HTMLInputElement>(null);
  const now = Math.floor(Date.now() / 1000);

  const { spotPairWatchlist, address } = useMarketPageContext();
  const recentIds = useRecentMarkets(slug);
  const searching = query.trim() !== "";

  // The tab the trader picked, or the first one with something in it.
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const favoriteIds = useMemo(
    () => spotPairWatchlist.filter((id) => /^0x[0-9a-fA-F]{40}$/.test(id)).slice(0, 50),
    [spotPairWatchlist],
  );
  const tab: Tab =
    chosenTab ?? (favoriteIds.length ? "favorites" : recentIds.length ? "recent" : "trending");

  const favorites = usePairsByIds(chain, favoriteIds, !searching && tab === "favorites");
  const recent = usePairsByIds(chain, recentIds, !searching && tab === "recent");
  const listed = useListedPairs(chain, !searching && tab === "listed");
  const trending = useTrendingPairs(chain, !searching && tab === "trending");
  const found = useFindPairs(chain, query);

  const toRows = (pairs: SpotPair[] | undefined) => (pairs ?? []).map(toPickerRow);

  const renderRows = (rows: PickerRow[]) =>
    rows.map((row) =>
      variant === "sheet" ? (
        <SheetRow
          key={row.id}
          row={row}
          chainName={chain}
          onSelect={onSelect}
          href={proHref(slug, row)}
          star={<RowStar row={row} variant="sheet" />}
          now={now}
        />
      ) : (
        <Row
          key={row.id}
          row={row}
          chainName={chain}
          onSelect={onSelect}
          href={proHref(slug, row)}
          star={<RowStar row={row} variant="popover" />}
          now={now}
        />
      ),
    );

  const header =
    variant === "popover" ? (
      <div className={cn("grid gap-2 px-3.5 pb-1.5 font-dm-mono text-[8.5px] uppercase tracking-[0.12em] text-[color:var(--m-text-secondary-2)]", DESKTOP_GRID)}>
        <span />
        <span>Market</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Quote TVL</span>
      </div>
    ) : null;

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setQuery(text);
    } catch {
      // Clipboard read refused: the field is focused so a long-press paste works.
    }
    inputRef.current?.focus();
  };

  let body: ReactNode;
  let footer: string;

  if (searching) {
    const rows = toRows(found.data?.pairs);
    const isAddress = isAddressQuery(query);
    if (found.isLoading && !found.data) {
      body = <Empty>Searching…</Empty>;
    } else if (rows.length === 0) {
      body = (
        <Empty>
          {isAddress ? (
            <>No market for this address on {chain}.</>
          ) : (
            <>
              No active market starting with “{query.trim()}” on {chain}.
              <br />
              Quieter markets are reached by address: paste the coin or pair address.
            </>
          )}
        </Empty>
      );
    } else if (found.data?.kind === "address") {
      body = (
        <>
          <GroupLabel label={rows.length === 1 ? "Exact match" : "Markets for this address"} aside={`${rows.length}`} />
          {header}
          {renderRows(rows)}
        </>
      );
    } else {
      const listedRows = rows.filter((r) => !r.unlisted);
      const launchRows = rows.filter((r) => r.unlisted);
      body = (
        <>
          {listedRows.length ? (
            <>
              <GroupLabel label="Listed" aside={`${listedRows.length}`} />
              {header}
              {renderRows(listedRows)}
            </>
          ) : null}
          {launchRows.length ? (
            <>
              <GroupLabel label="Active launches · traded in 24h" aside={`${launchRows.length}`} />
              {listedRows.length ? null : header}
              {renderRows(launchRows)}
            </>
          ) : null}
        </>
      );
    }
    footer = found.isPending || found.isFetching
      ? "Searching…"
      : isAddress
        ? "An address finds any market on this network, however quiet."
        : "Names find listed markets and launches that traded in the last 24h. Paste an address for any other.";
  } else {
    const source = { favorites, recent, listed, trending }[tab];
    const rows = toRows(source.data);
    if (tab === "favorites" && !address) {
      body = <Empty>Connect a wallet to keep favorites. They are saved to your wallet and follow it to any device.</Empty>;
    } else if ((tab === "favorites" && favoriteIds.length === 0) || (tab === "favorites" && !source.isLoading && rows.length === 0)) {
      body = <Empty>Star a market to keep it here.</Empty>;
    } else if (tab === "recent" && recentIds.length === 0) {
      body = <Empty>Markets you open on {chain} appear here, including ones you reach by a link.</Empty>;
    } else if (source.isLoading) {
      body = <Empty>Loading markets…</Empty>;
    } else if (source.error) {
      body = <Empty>Could not load these markets. Try again in a moment.</Empty>;
    } else if (rows.length === 0) {
      body = (
        <Empty>
          {tab === "listed"
            ? `No listed markets on ${chain} yet.`
            : `No launch on ${chain} traded in the last 24 hours.`}
        </Empty>
      );
    } else {
      body = (
        <>
          {variant === "popover" ? <div className="pt-2.5">{header}</div> : null}
          {renderRows(rows)}
        </>
      );
    }
    footer = {
      favorites: "Saved to your wallet.",
      recent: "Opened on this device, newest first.",
      listed: "Graduated markets, by 24h volume.",
      trending: "Top launches that traded in the last 24h, by volume.",
    }[tab];
  }

  return (
    <div className={cn("flex w-full flex-col", variant === "sheet" && "h-full min-h-0", className)}>
      <div
        className={cn(
          "flex w-full items-center gap-2",
          variant === "popover"
            ? "border-b border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-3"
            : cn("px-4 pb-3", searching && "border-b border-[color:var(--m-border)]"),
        )}
      >
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-2.5 focus-within:border-[color:var(--m-primary)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[color:var(--m-text-secondary-2)]" aria-hidden />
          <span className="sr-only">Search markets</span>
          <input
            id="pair-picker-search"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={variant === "sheet" ? "Name or address" : "Search a name, or paste an address"}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="grid h-6 w-6 place-items-center rounded text-[color:var(--m-text-secondary-2)] hover:text-[color:var(--m-text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
        {variant === "sheet" ? (
          <button
            type="button"
            onClick={() => void paste()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 text-[12px] font-semibold text-[color:var(--m-text-primary)]"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
            Paste
          </button>
        ) : null}
        <ChainSwitcher
          value={chain}
          onSelect={setChain}
          triggerClassName={variant === "sheet" ? "h-9 gap-1 px-2 rounded-[9px]" : "h-8 gap-1.5 px-2.5 rounded-full"}
          className="shrink-0"
        />
      </div>

      {searching ? null : (
        <div
          role="tablist"
          aria-label="Market lists"
          className={cn(
            "flex shrink-0 gap-1 overflow-x-auto",
            variant === "popover"
              ? "border-b border-[color:var(--m-border)] px-2.5 pt-1.5"
              : "border-b border-[color:var(--m-border)] px-4 pb-3",
          )}
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            const count = t.id === "favorites" ? favoriteIds.length : t.id === "recent" ? recentIds.length : null;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setChosenTab(t.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap text-[12px] transition-colors",
                  variant === "popover"
                    ? cn("border-b-2 px-2.5 pb-2 pt-1.5", on ? "border-[color:var(--m-accent)] font-semibold text-[color:var(--m-text-primary)]" : "border-transparent text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]")
                    : cn("rounded-full border px-3 py-1.5", on ? "border-[color:var(--m-text-primary)] bg-[color:var(--m-text-primary)] text-[color:var(--m-surface)]" : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]"),
                )}
              >
                {t.label}
                {count ? <span className="ml-1 font-dm-mono text-[10px] opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <ThemedScrollArea className={cn("w-full overflow-y-auto", variant === "popover" ? "h-80" : "min-h-0 flex-1")}>
        {body}
      </ThemedScrollArea>

      <div
        className={cn(
          "border-t border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary-2)]",
          variant === "sheet"
            ? "px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] text-[11.5px]"
            : "px-3.5 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] text-[10.5px]",
        )}
      >
        {footer}
      </div>
    </div>
  );
}
