"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { TokenArt } from "@/components/Launch/TokenArt";
import { crownOf, crownPct, sparkPoints } from "@/lib/launch/crown";
import { formatMarketCap, formatSubscriptDecimal, formatUsd } from "@/utils/number";
import { cn } from "@/lib/utils";
import type { SpotToken } from "@/types";

/**
 * The race to listing, at the top of /launch.
 *
 * The grid below answers "what exists". This answers "what is about to happen",
 * which is the question people actually open a launch page with — and the one
 * a ranked grid cannot answer, because the leader looks like any other card in
 * it.
 *
 * ## Every figure here is a column, and the two that are not are absent
 *
 * Market cap, price, 24h change, 24h volume, liquidity and the all-time high
 * all come off the token row the grid already fetched, so this section costs no
 * request. Two things the reference design shows are NOT rendered:
 *
 *  - **Holders.** Nothing indexes ERC-20 `Transfer` in this monorepo, so a
 *    holder count cannot be computed from anything the venue has — see the
 *    traders-panel note in apps/web/CLAUDE.md, which keeps calling its column
 *    "Trader" for exactly this reason. Trades is shown instead, which is real.
 *  - **Peak market cap.** `ath` is a PRICE. Turning it into a cap means
 *    ath × totalSupply, the second source of truth that `spotTokens.marketCap`
 *    was made a generated column to delete. So the peak is labelled as a price,
 *    which is what it is.
 */
export function KingOfTheHill({
  tokens,
  thresholdUsd,
}: {
  tokens: readonly SpotToken[];
  thresholdUsd?: number;
}) {
  const { displayNetworkSlug } = useMarketPageContext();
  const { king, contenders, top } = crownOf(tokens, thresholdUsd);
  const href = (token: SpotToken) =>
    `/explore/tokens/${encodeURIComponent(token.symbol)}?chain=${encodeURIComponent(displayNetworkSlug)}`;

  // No threshold, no race — and no invented one. The strip still has meaning on
  // its own, so it stays and the crown does not appear.
  if (!king) return top.length > 0 ? <TopStrip top={top} href={href} /> : null;

  const pct = crownPct(king, thresholdUsd);
  const points = sparkPoints(king);

  return (
    <section aria-label="Closest to listing" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <article className="flex flex-col gap-5 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="flex items-center gap-2 text-[color:var(--m-logo)]">
              <Crown size={16} strokeWidth={2} aria-hidden />
              <b className="text-[15px] font-semibold">King of the Hill</b>
            </span>
            {/* The target, named. The whole section is meaningless without it,
                and it is operator-set rather than a number we may print. */}
            <span className="font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary)]">
              Closest to {formatMarketCap(thresholdUsd)}
            </span>
          </header>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <Link href={href(king)} className="group flex min-w-0 items-center gap-3">
              <TokenArt
                symbol={king.symbol}
                logoURI={king.logoURI}
                showSymbol={false}
                className="h-14 w-14 shrink-0 rounded-full"
              />
              <span className="min-w-0">
                <b className="block truncate text-2xl font-semibold tracking-[-0.03em] group-hover:underline">
                  ${king.symbol}
                </b>
                <span className="block truncate text-[12.5px] text-[color:var(--m-text-secondary)]">
                  {king.name || king.symbol}
                </span>
              </span>
            </Link>
            <div className="text-right">
              <b className="block font-dm-mono text-2xl font-semibold tabular-nums tracking-[-0.03em]">
                {formatMarketCap(king.marketCap)}
              </b>
              <Change pct={king.dayPriceDifferencePercentage} />
              {/* A price, said as a price. See the note above. */}
              {typeof king.ath === "number" && king.ath > 0 && (
                <span className="mt-0.5 block font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)] tabular-nums">
                  Peak price {price(king.ath)}
                </span>
              )}
            </div>
          </div>

          {pct !== null && (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                <span>To listing</span>
                <span className="tabular-nums">{pct.toFixed(1)}%</span>
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]">
                <span
                  className="block h-full rounded-full bg-[color:var(--m-logo)]"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
          )}

          <Spark points={points} />

          <dl className="grid grid-cols-3 gap-3 border-t border-[color:var(--m-border)] pt-4">
            <Stat k="Price" v={price(king.priceUSD)} />
            <Stat k="24h volume" v={formatUsd(king.dayVolumeUSD)} />
            {/* Not holders. Trades is a column; holders is not indexed. */}
            <Stat k="Trades" v={count(king.dayTradesCount ?? king.tradesCount)} />
          </dl>
        </article>

        <aside className="flex flex-col rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
          <header className="flex items-baseline justify-between gap-2">
            <b className="text-[15px] font-semibold">Contenders</b>
            <span className="font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary)]">
              Closest to {formatMarketCap(thresholdUsd)}
            </span>
          </header>
          {contenders.length === 0 ? (
            <p className="py-6 text-[13px] text-[color:var(--m-text-secondary)]">
              Nothing else is climbing yet — {king.symbol} is the only launch with a market.
            </p>
          ) : (
            <ol className="mt-1 flex flex-col">
              {contenders.map((token, index) => (
                <li key={token.id}>
                  <Link
                    href={href(token)}
                    className="group flex items-center gap-3 border-b border-[color:var(--m-border)] py-2.5 last:border-b-0"
                  >
                    <span className="w-3 shrink-0 font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)] tabular-nums">
                      {index + 2}
                    </span>
                    <TokenArt
                      symbol={token.symbol}
                      logoURI={token.logoURI}
                      showSymbol={false}
                      className="h-7 w-7 shrink-0 rounded-full"
                    />
                    <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold group-hover:underline">
                      {token.symbol}
                    </b>
                    <span className="text-right">
                      <span className="block font-dm-mono text-[12px] tabular-nums">
                        {formatMarketCap(token.marketCap)}{" "}
                        <span className="text-[color:var(--m-text-secondary-2)]">mcap</span>
                      </span>
                      <Change pct={token.dayPriceDifferencePercentage} small />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <TopStrip top={top} href={href} />
    </section>
  );
}

function TopStrip({
  top,
  href,
}: {
  top: SpotToken[];
  href: (token: SpotToken) => string;
}) {
  if (top.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-dm-mono text-[10.5px] uppercase tracking-[0.11em] text-[color:var(--m-text-secondary-2)]">
        Top by market cap
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {top.map((token) => (
          <Link
            key={token.id}
            href={href(token)}
            className="group flex items-center gap-3 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3 transition-colors hover:border-[color:var(--m-text-secondary-2)]"
          >
            <TokenArt
              symbol={token.symbol}
              logoURI={token.logoURI}
              showSymbol={false}
              className="h-9 w-9 shrink-0 rounded-full"
            />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px] font-semibold group-hover:underline">
                ${token.symbol}
              </b>
              <span className="block font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary)] tabular-nums">
                {formatMarketCap(token.marketCap)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <Change pct={token.dayPriceDifferencePercentage} small />
              {/* Real liquidity, from the pair's own quote TVL column. */}
              <span className="block font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)] tabular-nums">
                {formatUsd(token.dayTvlUSD)} liq
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * The 7-day line, or a sentence.
 *
 * A young venue answers `sparkline7D: [1]`, and one point drawn as a line is a
 * flat week — a claim about time that has not passed. `sparkPoints` refuses
 * those, and this says why instead of drawing nothing at all.
 */
function Spark({ points }: { points: number[] | null }) {
  if (!points) {
    return (
      <p className="rounded-xl border border-dashed border-[color:var(--m-border)] px-3 py-5 text-center text-[12px] text-[color:var(--m-text-secondary-2)]">
        Not enough price history to chart yet.
      </p>
    );
  }
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const d = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 26 - ((value - lo) / span) * 24;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const up = points[points.length - 1]! >= points[0]!;
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label="Price over the last seven days"
    >
      <path
        d={d}
        fill="none"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        stroke={up ? "var(--m-success)" : "var(--m-error)"}
      />
    </svg>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-dm-mono text-[10.5px] uppercase tracking-[0.09em] text-[color:var(--m-text-secondary-2)]">
        {k}
      </dt>
      <dd className="mt-0.5 font-dm-mono text-[14px] font-medium tabular-nums">{v}</dd>
    </div>
  );
}

function Change({ pct, small = false }: { pct?: number | null; small?: boolean }) {
  if (typeof pct !== "number" || !Number.isFinite(pct)) {
    return <span className="block font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">—</span>;
  }
  return (
    <span
      className={cn(
        "block font-dm-mono tabular-nums",
        small ? "text-[11px]" : "text-[12.5px]",
        pct >= 0 ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]",
      )}
    >
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(pct >= 100 || pct <= -100 ? 0 : 2)}% <span className="text-[color:var(--m-text-secondary-2)]">24h</span>
    </span>
  );
}

/** The venue's own sub-cent rule, so a launch price is not rendered as $0.00. */
function price(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const sub = formatSubscriptDecimal(n);
  return sub !== null ? `$${sub}` : formatUsd(n);
}

function count(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n.toLocaleString("en-US") : "—";
}
