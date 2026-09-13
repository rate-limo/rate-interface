"use client";

import Link from "next/link";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { formatMarketCap } from "@/utils/number";
import { cn } from "@/lib/utils";
import type { SpotPair, SpotToken } from "@/types";
import { DEFAULT_THRESHOLD_USD } from "@/lib/liquidity/thresholdDefault";
import { hasNoTokenLogo } from "@/lib/tokens/logo";
import { GraduationGauge } from "@/components/Launch/GraduationGauge";

/**
 * Token cards — the discovery layout, for launches.
 *
 * A grid of square art, a name, a tagline and a market cap is how a launchpad reads, and
 * it is right for a coin nobody has heard of: the art and the progress toward listing ARE
 * the content. It is wrong for ETH/USDC, where the numbers are the content and four giant
 * logos tell you nothing — which is why this is a view, not a replacement for the table.
 *
 * The progress bar is the point of the card. A market needs exactly one thing to list —
 * quote liquidity — and a threshold nobody can see is a threshold nobody works toward.
 * It reads the same `dayQuoteTvlUSD` and the same threshold as the Approaching-listing
 * shelf, so a card and a shelf can never disagree about how close a market is.
 */

/**
 * Quote SPENT BUYING this token's launch market — what graduation grades on —
 * or null when it has no pair here, or when the figure has never been measured.
 *
 * This read `dayQuoteTvlUSD`, resting bid depth, which is a 24h level that
 * empties as bids fill: a coin that traded drove its own card back to 0%.
 *
 * Null rather than 0 for an unwritten column. It is populated by a broker from
 * 2026-09-06 and is absent on older rows until the backfill runs, and the card
 * already renders null as "no market" rather than as no progress.
 */
function quoteBoughtFor(token: SpotToken, pairs: SpotPair[]): number | null {
  const pair = pairs.find((p) => p.baseSymbol?.toUpperCase() === token.symbol?.toUpperCase());
  if (!pair) return null;
  return pair.buyQuoteVolumeUSD ?? null;
}

function ageLabel(seconds: number | null | undefined, now: number | null): string {
  if (now === null || !seconds || !Number.isFinite(seconds)) return "—";
  const delta = Math.max(0, now - seconds);
  if (delta < 3_600) return `${Math.max(1, Math.floor(delta / 60))}m`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h`;
  return `${Math.floor(delta / 86_400)}d`;
}

/**
 * A stable colour per symbol, for the letter tile a token without a logo falls back to.
 *
 * Deterministic rather than random: the same coin must not change colour between renders,
 * and a hash keeps that true without a lookup table that would need a row per launch.
 */
function symbolColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) % 360;
  return `hsl(${hash} 52% 45%)`;
}

function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TokenCards({
  tokens,
  pairs,
  now,
  networkSlug,
  chainName,
  thresholdUsd = DEFAULT_THRESHOLD_USD,
  className,
}: {
  tokens: SpotToken[];
  /** Every pair on the chain, for the quote-TVL lookup behind the progress bar. */
  pairs: SpotPair[];
  now: number | null;
  networkSlug: string;
  chainName: string;
  thresholdUsd?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {tokens.map((t) => {
        const isLaunch = (t.creator ?? "") !== "";
        const change = t.dayPriceDifferencePercentage ?? 0;
        const quoteBought = quoteBoughtFor(t, pairs);
        const pct =
          quoteBought === null || thresholdUsd <= 0
            ? null
            : Math.max(0, Math.min(100, (quoteBought / thresholdUsd) * 100));
        // A token absent from the static token list has no artwork until its
        // creator binds some, so this is a real fact about the token rather than
        // a loading state — the launch flow's `/token-logo/claim` is what clears it.
        //
        // Shared with what the icon itself decided to draw, so the chip cannot
        // disagree with the image beside it: both empty and the legacy
        // `placeholder_token.png` count as absent. See lib/tokens/logo.ts.
        const placeholder = hasNoTokenLogo(t.logoURI);

        return (
          <Link
            key={t.id}
            href={`/explore/tokens/${encodeURIComponent(t.symbol)}?chain=${encodeURIComponent(networkSlug)}`}
            className="flex flex-col overflow-hidden rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] transition-colors hover:border-[color:var(--m-primary)]"
          >
            <div className="relative grid aspect-square place-items-center bg-[color:var(--m-surface)]">
              <TokenImageIcon
                symbol={t.symbol}
                logoURI={t.logoURI}
                color={symbolColor(t.symbol)}
                chainName={chainName}
                className="h-20 w-20 rounded-[14px] text-2xl"
              />
              {placeholder && (
                <span
                  className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-px font-dm-mono text-[8px] font-bold uppercase tracking-wide"
                  style={{ backgroundColor: "var(--m-warning)", color: "#2b1f00" }}
                >
                  placeholder
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-1.5 px-2.5 pb-2.5 pt-2">
              <div className="flex items-baseline gap-1.5">
                <b className="text-[13.5px] text-[color:var(--m-text-primary)]">{t.symbol}</b>
                <span className="truncate font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">
                  {t.name}
                </span>
              </div>

              {/* adminTokenMeta.description, already merged into every token response. An
                  empty one says so rather than showing filler — it also gives the creator
                  a visible reason to add one. */}
              <p
                className={cn(
                  "m-0 line-clamp-2 min-h-[2.4em] text-[11.5px]",
                  t.description
                    ? "text-[color:var(--m-text-secondary)]"
                    : "italic text-[color:var(--m-text-secondary-2)]",
                )}
              >
                {t.description || "No description yet."}
              </p>

              <div className="flex items-baseline justify-between font-dm-mono text-[11.5px] tabular-nums">
                <span className="text-[color:var(--m-text-secondary-2)]">MCap</span>
                <b className="text-[13px] text-[color:var(--m-text-primary)]">
                  {formatMarketCap(t.marketCap)}
                </b>
              </div>

              <div className="flex items-baseline justify-between font-dm-mono text-[10px] tabular-nums">
                <span
                  className={cn(
                    change > 0 && "text-[color:var(--m-success-fg)]",
                    change < 0 && "text-[color:var(--m-error-fg)]",
                    !change && "text-[color:var(--m-text-secondary-2)]",
                  )}
                >
                  {change ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : "—"} 24h
                </span>
                {t.verified ? (
                  <span
                    className="rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wide"
                    style={{
                      color: "var(--m-success)",
                      backgroundColor: "color-mix(in srgb, var(--m-success) 18%, transparent)",
                    }}
                  >
                    listed
                  </span>
                ) : pct !== null ? (
                  <span className="text-[color:var(--m-primary)]">building liquidity</span>
                ) : (
                  <span className="text-[color:var(--m-text-secondary-2)]">no market</span>
                )}
              </div>

              {/* Only for markets still working toward listing: a full bar on something
                  already listed would be decoration, and the badge above says it better. */}
              {isLaunch && !t.verified && (
                <GraduationGauge
                  boughtUsd={quoteBought ?? 0}
                  thresholdUsd={thresholdUsd}
                  size="sm"
                  variant="bar"
                  className="mt-1 rounded-[10px] border border-[color-mix(in_srgb,var(--m-primary)_24%,var(--m-border))] bg-[color-mix(in_srgb,var(--m-primary)_7%,var(--m-surface))] px-2 py-1.5"
                />
              )}

              <div className="mt-auto flex items-baseline justify-between pt-0.5 font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">
                <span>{isLaunch ? `by ${shortAddress(t.creator)}` : "listed market"}</span>
                <span>{ageLabel(t.listingDate, now)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
