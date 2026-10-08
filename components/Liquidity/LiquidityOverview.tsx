"use client";

import Link from "next/link";
import { formatPct } from "@/lib/pair/derive";
import { useState } from "react";
import type { LiquidityOverview as OverviewData, PoolRow } from "@/lib/liquidity/poolStats";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";

/**
 * The /pool reading surface: what liquidity exists, where the yield is, and a way
 * into the provide flow for a specific pool.
 *
 * Companion to LiquidityFlow (now at /pool/new), which is the doing surface. Same
 * split as Trade's Basic/Pro — the bare route reads, the deeper route acts.
 *
 * ## Two kinds of number share every row
 *
 * A pool's **rate** is an exchange rate, rendered `1 ETH = 1,635 USDC` with no
 * `$` prefix. That is not a style preference: the Liquidity spec calls it out
 * because a dollar sign is simply wrong for a non-USD pair, and `ETH/WBTC` makes
 * that obvious. TVL, volume, fees and APR genuinely are dollar and percent
 * figures, so they keep their units. Both live in the same row and the
 * distinction has to survive.
 *
 * ## Why APR uses the -600 green
 *
 * `--m-success` is a fill colour. As text on the warm stone ground it measures
 * 2.55:1, under the 4.5:1 floor; `--m-success-600` clears 5.35:1. Anything here
 * that is a coloured *figure* rather than a coloured *shape* uses the -600 step.
 */

function usd(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  if (opts.compact && n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (opts.compact && n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Rates span many orders of magnitude across pools — 64,102 USDC per WBTC next to
 * 0.0255 WBTC per ETH — so significant figures matter more than a fixed decimal
 * count. A stablecoin pair needs four places to show it is off peg at all.
 */
function rate(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString();
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(3);
}

/** Null (no TVL to divide by) and zero both render as an em-dash — `0%` is
 * indistinguishable from a real zero yield, and a launch book with volume and
 * no depth would otherwise advertise one. */
function pct(n: number | null): string {
  // Through the shared formatter, so a sub-1 APR reads as 0.0\u2083414% rather than
  // the 0.0% `toFixed(1)` used to flatten it to.
  return n !== null && Number.isFinite(n) && n > 0 ? formatPct(n, 1) : "—";
}

/**
 * Progress toward listing, for a launch pool.
 *
 * The quote side only: the base side of a launch pool is the creator's own
 * seeded mint, so counting it would let a market list itself.
 */
function ListingProgress({ pool, thresholdUsd }: { pool: PoolRow; thresholdUsd: number }) {
  const pctOf = thresholdUsd > 0 ? Math.min(100, (pool.quoteTvlUsd / thresholdUsd) * 100) : 100;
  const met = pool.quoteTvlUsd >= thresholdUsd;
  const shortfall = Math.max(0, thresholdUsd - pool.quoteTvlUsd);
  return (
    <div className="flex min-w-[130px] flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pctOf}%`,
            backgroundColor: met ? "var(--m-success)" : "var(--m-text-secondary-2)",
          }}
        />
      </div>
      <span className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary)] tabular-nums">
        {met ? "threshold met" : `${usd(shortfall, { compact: true })} to go`}
      </span>
    </div>
  );
}

/** The same two pieces of furniture every unlisted market carries, everywhere:
 * a chip that says so, and its distance to the threshold. */
function UnlistedChip() {
  return (
    <span className="rounded-[5px] border border-[color:var(--m-text-secondary-2)] px-1.5 py-px font-dm-mono text-[9px] tracking-wide text-[color:var(--m-text-secondary-2)] uppercase">
      Unlisted
    </span>
  );
}

function Tile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 py-3.5">
      <span className="font-dm-mono text-[10px] tracking-[0.09em] text-[color:var(--m-text-secondary)] uppercase">
        {label}
      </span>
      <span className="font-dm-mono text-2xl font-medium tracking-[-0.03em] text-[color:var(--m-text-primary)] tabular-nums">
        {value}
      </span>
      <span className="text-xs text-[color:var(--m-text-secondary)]">{detail}</span>
    </div>
  );
}

function PairCell({ pool }: { pool: PoolRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
        <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
          <TokenImageIcon symbol={pool.baseSymbol} logoURI={pool.baseLogoURI} color={tokenColor(pool.baseSymbol)} size="md" className="h-9 w-9 rounded-none" />
        </span>
        <span className="absolute inset-y-0 left-1/2 w-1/2 overflow-hidden">
          <TokenImageIcon symbol={pool.quoteSymbol} logoURI={pool.quoteLogoURI} color={tokenColor(pool.quoteSymbol)} size="md" className="h-9 w-9 -translate-x-1/2 rounded-none" />
        </span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 truncate text-sm font-semibold text-[color:var(--m-text-primary)]">
          {pool.symbol}
          {!pool.listed && <UnlistedChip />}
        </span>
        <span className="truncate font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] tabular-nums">
          {pool.rate > 0
            ? `1 ${pool.baseSymbol} = ${rate(pool.rate)} ${pool.quoteSymbol}`
            : "rate unavailable"}
        </span>
      </span>
    </div>
  );
}

/**
 * Three states, not two — and conflating the last two is the trap.
 *
 *   unreachable : the query threw. We know nothing.
 *   empty       : the query succeeded and returned no pools. Different claim!
 *
 * The second is the live situation today: `spotPairs` exists and is queryable,
 * but the indexer that populates it is down, so it comes back empty. Showing
 * "can't reach the source" there would be wrong, and showing a bare empty table
 * would read as "Rate has no liquidity", which is wrong in the other direction.
 */
function NoPools({
  slug,
  reason,
}: {
  slug: string;
  reason: "unreachable" | "empty";
}) {
  const copy =
    reason === "unreachable"
      ? {
          eyebrow: "Pool data unavailable",
          heading: "Can't reach the market data source",
          body: "This is the indexer, not the pools — liquidity on-chain is unaffected. You can still open a position if you know the pair you want.",
        }
      : {
          eyebrow: "No pools recorded",
          heading: "Nothing indexed on this chain yet",
          body: "The market data source answered, but has no pools for this network. If you expect liquidity here, the indexer is likely still catching up.",
        };

  return (
    <div className="rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-6 py-12 text-center">
      <p className="font-dm-mono text-[11px] tracking-[0.12em] text-[color:var(--m-text-secondary)] uppercase">
        {copy.eyebrow}
      </p>
      <h2 className="mt-3 text-lg font-semibold text-[color:var(--m-text-primary)]">
        {copy.heading}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[color:var(--m-text-secondary)]">
        {copy.body}
      </p>
      <Link
        href={buildPageUrl("pool", { slug, provide: true })}
        className="mt-5 inline-flex h-11 items-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-5 text-sm font-semibold text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary-300)] hover:bg-[color:var(--m-primary-100)] hover:text-[color:var(--m-primary-700)]"
      >
        Provide liquidity
      </Link>
    </div>
  );
}

export function LiquidityOverview({
  data,
  networkSlug,
}: {
  data: OverviewData;
  networkSlug: string;
}) {
  const { pools, launches, isFallback, thresholdUsd } = data;
  const feeLabel = `${(data.feeRate * 100).toFixed(2)}% taker`;

  /**
   * Listed is the default view, and the headline tiles always describe it.
   *
   * That default is the fix as much as the filter is: this query never went
   * through the gateway (it reads Postgres directly), so it never applied the
   * listing gate, and unlisted markets were in the table AND inside Total value
   * locked and Median LP APR. Defaulting to Listed is what stops the filter
   * silently changing figures people size positions against.
   */
  const [view, setView] = useState<"listed" | "launches">("listed");
  const rows = view === "listed" ? pools : launches;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-7 pb-28 min-[700px]:px-7 min-[1200px]:pb-16">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-xl font-semibold text-[color:var(--m-text-primary)]">
          Liquidity
        </h1>
        <Link
          href={buildPageUrl("pool", { slug: networkSlug, provide: true })}
          className="ml-auto inline-flex h-10 items-center rounded-full bg-[color:var(--m-primary)] px-4 text-sm font-bold text-[color:var(--m-on-primary)] transition-colors hover:bg-[color:var(--m-primary-hover)]"
        >
          New position
        </Link>
      </div>

      {pools.length === 0 && launches.length === 0 ? (
        <NoPools slug={networkSlug} reason={isFallback ? "unreachable" : "empty"} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
            <Tile
              label="Total value locked"
              value={usd(data.totalTvlUsd, { compact: true })}
              detail={`across ${pools.length} ${pools.length === 1 ? "pool" : "pools"}`}
            />
            <Tile
              label="Volume · 24h"
              value={usd(data.totalVolume24hUsd, { compact: true })}
              detail={feeLabel}
            />
            <Tile
              label="Fees to LPs · 24h"
              value={usd(data.totalFees24hUsd)}
              detail="from taker flow"
            />
            <Tile
              label="Median LP APR"
              value={pct(data.medianAprPct)}
              // The Rate dashboard advertises "net of estimated impermanent
              // loss"; this figure is not that, and says so rather than
              // implying a number nobody has modelled.
              detail="gross of impermanent loss"
            />
          </div>

          {/* The filter, and the sentence that keeps the tiles honest. */}
          {launches.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label="Pool listing status"
                className="inline-flex rounded-full border border-[color:var(--m-border)] p-0.5"
              >
                {(
                  [
                    { key: "listed", label: "Listed", count: pools.length },
                    { key: "launches", label: "Launches", count: launches.length },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={view === tab.key}
                    onClick={() => setView(tab.key)}
                    className={`rounded-full px-4 py-1.5 font-dm-mono text-[11px] tracking-[0.08em] uppercase transition-colors ${
                      view === tab.key
                        ? "bg-[color:var(--m-primary)] font-bold text-[color:var(--m-on-primary)]"
                        : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
                    }`}
                  >
                    {tab.label} {tab.count}
                  </button>
                ))}
              </div>
              <p className="m-0 text-xs text-[color:var(--m-text-secondary)]">
                Totals above cover listed pools only.
              </p>
            </div>
          )}

          {view === "launches" && (
            <div className="mb-3 flex gap-3 rounded-xl border border-[color:var(--m-warning)] bg-[color:color-mix(in_srgb,var(--m-warning)_11%,transparent)] px-4 py-3">
              <span className="shrink-0 font-bold text-[color:var(--m-warning-600)]">△</span>
              <p className="m-0 text-[13px] text-[color:var(--m-text-secondary)]">
                <b className="text-[color:var(--m-text-primary)]">
                  Launch pools — not listed.
                </b>{" "}
                Anyone can deploy a token and open a market; Rate has reviewed none of these.
                Providing <b className="text-[color:var(--m-text-primary)]">quote</b> liquidity is
                what lists one — at {usd(thresholdUsd, { compact: true })} it graduates and joins
                the main table. Base-side liquidity does not count toward the threshold.
              </p>
            </div>
          )}

          {rows.length === 0 && (
            <p className="rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-6 py-10 text-center text-sm text-[color:var(--m-text-secondary)]">
              {view === "listed"
                ? "No pool has graduated yet. Every market on this chain is still a launch."
                : "No unlisted markets on this chain."}
            </p>
          )}

          {/* Desktop: the full table. */}
          <div
            className={`overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] ${
              rows.length === 0 ? "hidden" : "hidden min-[900px]:block"
            }`}
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {(view === "launches"
                    ? ["Pool", "TVL", "Quote side", "To listing", "Vol 24h", "LP APR", ""]
                    : ["Pool", "TVL", "Vol 24h", "Fees 24h", "LP APR", ""]
                  ).map((h, i) => (
                    <th
                      key={h || "action"}
                      scope="col"
                      className={`border-b border-[color:var(--m-border)] px-4 py-2.5 font-dm-mono text-[10px] font-normal tracking-[0.09em] text-[color:var(--m-text-secondary)] uppercase ${
                        i === 0 ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((pool) => (
                  <tr
                    key={pool.symbol}
                    className="border-b border-[color:var(--m-border)] last:border-b-0 hover:bg-[color:var(--m-surface-2)]"
                  >
                    <td className="px-4 py-2.5">
                      <PairCell pool={pool} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-dm-mono text-[13px] text-[color:var(--m-text-primary)] tabular-nums">
                      {usd(pool.tvlUsd, { compact: true })}
                    </td>
                    {view === "launches" && (
                      <>
                        <td className="px-4 py-2.5 text-right font-dm-mono text-[13px] text-[color:var(--m-text-primary)] tabular-nums">
                          {usd(pool.quoteTvlUsd, { compact: true })}
                        </td>
                        <td className="px-4 py-2.5">
                          <ListingProgress pool={pool} thresholdUsd={thresholdUsd} />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-right font-dm-mono text-[13px] text-[color:var(--m-text-primary)] tabular-nums">
                      {usd(pool.volume24hUsd, { compact: true })}
                    </td>
                    {view === "listed" && (
                      <td className="px-4 py-2.5 text-right font-dm-mono text-[13px] text-[color:var(--m-text-secondary-2)] tabular-nums">
                        {usd(pool.fees24hUsd)}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right font-dm-mono text-[13px] text-[color:var(--m-success-fg)] tabular-nums">
                      {pct(pool.aprPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={buildPageUrl("pool", {
                          slug: networkSlug,
                          provide: true,
                          base: pool.baseSymbol,
                          quote: pool.quoteSymbol,
                        })}
                        className="text-[13px] font-semibold text-[color:var(--m-primary-fg)] hover:text-[color:var(--m-primary-700)]"
                      >
                        Provide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: six columns don't survive a phone, so each pool becomes a
              card carrying only what drives the decision. */}
          <ul className="flex list-none flex-col gap-2 p-0 min-[900px]:hidden">
            {rows.map((pool) => (
              <li key={pool.symbol}>
                <Link
                  href={buildPageUrl("pool", {
                    slug: networkSlug,
                    provide: true,
                    base: pool.baseSymbol,
                    quote: pool.quoteSymbol,
                  })}
                  className="flex items-center gap-3 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 py-3"
                >
                  <PairCell pool={pool} />
                  <div className="ml-auto flex shrink-0 flex-col items-end">
                    {/* On a launch card the APR is the least useful number in
                        the row — progress to listing is what the card is for. */}
                    {pool.listed ? (
                      <span className="font-dm-mono text-sm text-[color:var(--m-success-fg)] tabular-nums">
                        {pct(pool.aprPct)}
                      </span>
                    ) : (
                      <span className="font-dm-mono text-sm text-[color:var(--m-text-primary)] tabular-nums">
                        {usd(pool.quoteTvlUsd, { compact: true })}
                      </span>
                    )}
                    <span className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary)] tabular-nums">
                      {pool.listed
                        ? `${usd(pool.tvlUsd, { compact: true })} TVL`
                        : `of ${usd(thresholdUsd, { compact: true })} quote`}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-[color:var(--m-text-secondary)]">
            {/* One expression for the whole sentence. Interleaving JSX text with
                `{feeLabel}` loses the space on either side of the expression —
                that shipped once as "0.10% takerrate" and then as "rate.Fee". */}
            {`Fees and APR are derived from 24h volume at the ${feeLabel} rate. ` +
              "Fee tiers and ±2% depth aren’t shown yet — tiers live in the pool " +
              "contract and depth comes off the order book, so neither is in this query."}
          </p>
        </>
      )}
    </div>
  );
}
