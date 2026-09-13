"use client";

import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { ChainBadge, TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { isUnlisted, partitionByListing } from "@/lib/search/listing";
import { tokenColor } from "@/lib/portfolio/mock";
import { LP_FEE_SHARE } from "@/lib/liquidity/derive";
import { cn } from "@/lib/utils";
import type { SpotPair } from "@/types";

function usd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function PoolLogo({ pair }: { pair: SpotPair }) {
  const { displayNetworkName } = useMarketPageContext();
  return (
    <span className="relative block h-8 w-10 shrink-0">
      <span className="absolute left-0 top-0 z-10 h-8 w-8 overflow-hidden rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
        <TokenImageIcon symbol={pair.baseSymbol} logoURI={pair.base.logoURI} color={tokenColor(pair.baseSymbol)} size="md" />
      </span>
      <span className="absolute left-4 top-0 h-8 w-8 overflow-hidden rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
        <TokenImageIcon symbol={pair.quoteSymbol} logoURI={pair.quote.logoURI} color={tokenColor(pair.quoteSymbol)} size="md" />
      </span>
      <span className="absolute -bottom-1 left-6 z-20">
        <ChainBadge chainName={displayNetworkName} size="sm" />
      </span>
    </span>
  );
}

/** Marks a pool Iter has not listed. Wording and tooltip are copied verbatim from
 * the search modal's chip — a reader who follows a market from one surface to the
 * other must not be told two different things. */
function UnlistedChip() {
  return (
    <span
      title="Not listed by Iter — anyone can deploy a token and open a market"
      className="shrink-0 rounded-[5px] border border-[color:var(--m-text-secondary-2)] px-1 py-px font-dm-mono text-[9px] uppercase text-[color:var(--m-text-secondary-2)]"
    >
      unlisted
    </span>
  );
}

/**
 * Every market on the chain, listed ones ranked first.
 *
 * This table used to be handed the listing-gated pair list alone, which made it
 * the only tab in the directory that could render nothing on a chain that has
 * markets: the other tabs source their rows from `useInfiniteTokens` and use
 * their `pairs` prop only as a metadata lookup. On a pre-graduation deployment
 * — every market unverified — the panel counted "Markets: 7" in its own header
 * while this tab said there were no pools.
 *
 * `partitionByListing` is what keeps that from becoming "unlisted markets rank
 * as equals": they sort last and carry the chip, reachable but never promoted.
 */

/** Flat protocol taker fee, matching lib/liquidity/poolStats.ts. */
const TAKER_FEE_RATE = 0.001;

export function PoolsTable({ pairs, search = "" }: { pairs: SpotPair[]; search?: string }) {
  const { displayNetworkSlug } = useMarketPageContext();
  const matches = pairs.filter((pair) => !search.trim() || pair.symbol.toLowerCase().includes(search.trim().toLowerCase()));
  const { listed, unlisted } = partitionByListing(matches);
  const rows = [...listed, ...unlisted];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--m-border)] text-left">
            <th className="py-3 pr-4 text-xs font-normal text-[color:var(--m-text-secondary)]">#</th>
            <th className="py-3 pr-4 text-xs font-normal text-[color:var(--m-text-secondary)]">Pool</th>
            <th className="py-3 pr-4 text-right text-xs font-normal text-[color:var(--m-text-secondary)]">TVL</th>
            <th className="py-3 pr-4 text-right text-xs font-normal text-[color:var(--m-text-secondary)]">1D vol</th>
            <th className="py-3 pr-4 text-right text-xs font-normal text-[color:var(--m-text-secondary)]">30D vol</th>
            <th className="py-3 pr-4 text-right text-xs font-normal text-[color:var(--m-text-secondary)]">1D vol/TVL</th>
            <th className="py-3 pr-4 text-right text-xs font-normal text-[color:var(--m-text-secondary)]">LP fees 1D</th>
            <th className="py-3 text-right text-xs font-normal text-[color:var(--m-text-secondary)]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((pair, index) => {
            const tvl = pair.dayBaseTvlUSD + pair.dayQuoteTvlUSD;
            /**
             * QUOTE volume, not base + quote.
             *
             * This summed both sides and so reported TWICE the notional. The two
             * are the same trades priced in USD from either leg — measured on Arc,
             * `dayBaseVolumeUSD` and `dayQuoteVolumeUSD` are EQUAL to the digit on
             * every pair (SKHY/USDC 0.2 and 0.2) — so a pool that traded $0.2 was
             * shown as $0.4, and `1D vol/TVL` and `LP fees 1D` below inherited the
             * doubling because both are derived from this line.
             *
             * Quote is the side the gateway already ranks pairs on and the side
             * graduation gates on, for the reason `mergePairs` records: a launch
             * pool's base side is the creator's own seeded mint, so the base leg is
             * the half an issuer can inflate at will.
             */
            const volume = pair.dayQuoteVolumeUSD;
            // Undefined from a gateway that predates the field, null when the pair
            // has no day buckets. Both render a dash: neither is a zero.
            const volume30D = pair.monthQuoteVolumeUSD;
            /**
             * What LPs earned on this pool in a day, not what the venue took.
             *
             * The taker fee is split on chain: `MatchingEngine.poolFeeShare` over
             * `DENOM` (50000000 / 100000000 today) is the pool's half, and the
             * rest is the protocol's. The APR this column replaced multiplied the
             * WHOLE taker fee, so it described the venue's revenue while sitting
             * in a column an LP reads as theirs — overstating it by 2x at the
             * current split.
             *
             * A rate, not a projection: APR annualises one day of volume and
             * calls the result a yield, which on a market that traded once reads
             * as a promise. Fees earned is a number that already happened.
             *
             * Sub-cent amounts render "<$0.01", never "$0". `usd()` rounds to
             * whole dollars, so a pool that genuinely earned something showed the
             * same figure as one that earned nothing — the em-dash-never-a-zero
             * rule this codebase applies to prices, for the same reason.
             */
            const lpFees = volume * TAKER_FEE_RATE * LP_FEE_SHARE;
            return (
              <tr key={pair.id} className="border-b border-[color:var(--m-border)]/50 hover:bg-[color:var(--m-surface-2)]">
                <td className="py-3.5 pr-4 font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">{index + 1}</td>
                <td className="py-3.5 pr-4">
                  <Link href={`/explore/pools/${encodeURIComponent(`${pair.baseSymbol}_${pair.quoteSymbol}`)}?chain=${encodeURIComponent(displayNetworkSlug)}`} className="inline-flex items-center gap-3 font-medium text-[color:var(--m-text-primary)] hover:text-[color:var(--m-primary-fg)]">
                    <PoolLogo pair={pair} />
                    <span className="flex flex-col leading-tight">
                      <span className="flex items-center gap-1.5">
                        {pair.symbol}
                        {isUnlisted(pair) && <UnlistedChip />}
                      </span>
                      <span className="mt-1 text-xs font-normal text-[color:var(--m-text-secondary)]">Iter CLOB · 0.10%</span>
                    </span>
                  </Link>
                </td>
                <td className="py-3.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{usd(tvl)}</td>
                <td className="py-3.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{usd(volume)}</td>
                <td className="py-3.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                  {typeof volume30D === "number" ? usd(volume30D) : "—"}
                </td>
                <td className="py-3.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">{tvl > 0 ? `${((volume / tvl) * 100).toFixed(2)}%` : "—"}</td>
                <td className="py-3.5 pr-4 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{lpFees <= 0 ? "—" : lpFees < 0.01 ? "<$0.01" : usd(lpFees)}</td>
                <td className="py-3.5 text-right text-[color:var(--m-text-secondary)]"><ChevronRight aria-hidden className="ml-auto h-4 w-4" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-[color:var(--m-text-secondary)]">No pools found on this chain.</p>}
    </div>
  );
}

export function PoolSearchButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={open ? "Close pool search" : "Search pools"} className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]", open && "text-[color:var(--m-text-primary)]")}>
      <Search aria-hidden className="h-4 w-4" />
    </button>
  );
}
