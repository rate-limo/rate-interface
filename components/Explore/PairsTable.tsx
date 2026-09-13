"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChainBadge, TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { tokenColor } from "@/lib/portfolio/mock";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";
import type { SpotPair } from "@/types";

/**
 * The pairs half of Explore's market table (Explore spec: Surfaces). Sortable
 * columns; the pair cell links to its market.
 * The row itself is NOT a link — chips are buttons, and nesting interactive
 * elements inside an anchor is the accessibility failure TokenTable's
 * full-row Link gets away with only because its rows carry no buttons.
 */

type SortKey = "price" | "change" | "volume" | "depth";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "change", label: "24h %" },
  { key: "volume", label: "Volume" },
  { key: "depth", label: "Depth" },
];

function metric(p: SpotPair, key: SortKey): number {
  switch (key) {
    case "price":
      return p.price;
    case "change":
      return p.dayPriceDifferencePercentage;
    case "volume":
      return p.dayBaseVolumeUSD + p.dayQuoteVolumeUSD;
    case "depth":
      return p.dayBaseTvlUSD + p.dayQuoteTvlUSD;
  }
}

function fmtUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v.toFixed(v < 10 ? 2 : 0)}`;
}

function PairLogo({ pair }: { pair: SpotPair }) {
  const { displayNetworkName } = useMarketPageContext();
  return (
    <span className="relative block h-8 w-8 shrink-0 overflow-visible rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
      <span className="absolute inset-0 overflow-hidden rounded-full">
        <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={pair.baseSymbol}
          logoURI={pair.base.logoURI}
          color={tokenColor(pair.baseSymbol)}
          size="md"
          className="h-8 w-8 rounded-none"
        />
        </span>
        <span className="absolute inset-y-0 left-1/2 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={pair.quoteSymbol}
          logoURI={pair.quote.logoURI}
          color={tokenColor(pair.quoteSymbol)}
          size="md"
          className="h-8 w-8 -translate-x-1/2 rounded-none"
        />
        </span>
      </span>
      <ChainBadge chainName={displayNetworkName} size="md" />
    </span>
  );
}

export function PairsTable({
  pairs,
  emptyText = "No pairs yet.",
  className,
}: {
  pairs: SpotPair[];
  emptyText?: string;
  className?: string;
}) {
  const { displayNetworkSlug } = useMarketPageContext();
  const [sortKey, setSortKey] = useState<SortKey>("depth");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(
    () =>
      [...pairs].sort(
        (a, b) => (metric(b, sortKey) - metric(a, sortKey)) * (desc ? 1 : -1),
      ),
    [pairs, sortKey, desc],
  );

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[color:var(--m-text-secondary)]">
        {emptyText}
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--m-border)] text-left">
            <th className="py-2 pr-4 text-xs font-normal text-[color:var(--m-text-secondary)]">
              Pair
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="py-2 pr-4 text-right">
                <button
                  type="button"
                  onClick={() => onSort(c.key)}
                  aria-label={`Sort by ${c.label}`}
                  className={cn(
                    "text-xs font-normal",
                    sortKey === c.key
                      ? "font-semibold text-[color:var(--m-text-primary)]"
                      : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
                  )}
                >
                  {c.label}
                  {sortKey === c.key ? (desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
            <th className="py-2 text-right text-xs font-normal text-[color:var(--m-text-secondary)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className="border-b border-[color:var(--m-border)]/50 hover:bg-[color:var(--m-surface-2)]"
            >
              <td className="py-2.5 pr-4">
                <Link
                  /* The pair PROFILE, not the terminal. Explore's doctrine is read
                     left / act right: the name is a reading link, and the three
                     action chips beside it re-bind the dock without navigating.
                     Trading is one more click, from the dock's CTA. */
                  href={buildPageUrl("pair", {
                    base: p.baseSymbol,
                    quote: p.quoteSymbol,
                    slug: displayNetworkSlug,
                  })}
                  className="inline-flex items-center gap-3 font-medium text-[color:var(--m-text-primary)] hover:text-[color:var(--m-primary-fg)]"
                >
                  <PairLogo pair={p} />
                  <span>{p.symbol}</span>
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                {p.price.toLocaleString()}
              </td>
              <td
                className={cn(
                  "py-2.5 pr-4 text-right font-dm-mono tabular-nums",
                  p.dayPriceDifferencePercentage >= 0
                    ? "text-[color:var(--m-success-fg)]"
                    : "text-[color:var(--m-error-fg)]",
                )}
              >
                {p.dayPriceDifferencePercentage >= 0 ? "+" : ""}
                {p.dayPriceDifferencePercentage.toFixed(1)}%
              </td>
              <td className="py-2.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                {fmtUSD(p.dayBaseVolumeUSD + p.dayQuoteVolumeUSD)}
              </td>
              <td className="py-2.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                {fmtUSD(p.dayBaseTvlUSD + p.dayQuoteTvlUSD)}
              </td>
              <td className="py-2.5 text-right">
                <span className="inline-flex gap-2">
                  <Link
                    href={buildPageUrl("pair", {
                      base: p.baseSymbol,
                      quote: p.quoteSymbol,
                      slug: displayNetworkSlug,
                    })}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[color:var(--m-border)] px-3 py-2 font-dm-mono text-xs text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)] hover:bg-[color:var(--m-surface-selected)]"
                  >
                    View pair
                  </Link>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
