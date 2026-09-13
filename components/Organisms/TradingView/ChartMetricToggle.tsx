"use client";

import { useState } from "react";
import { buildMarketCapSymbol } from "@iter/types";
import { cn } from "@/lib/utils";

export type ChartMetric = "price" | "marketCap";

/** What the toggle needs to know about the token it is charting. */
type MetricToken = {
  symbol: string;
  totalSupply?: number | null;
  /** Empty/absent for tokens the broker learned about via PairAdded alone. */
  creator?: string | null;
};

/**
 * Price / Market cap, for any surface that charts a single TOKEN.
 *
 * Lives here rather than in a page because there is now more than one such
 * surface — the token profile (`/price/[token]`) and the coin profile — and the
 * rules below are the kind that go wrong quietly when they are copied:
 *
 * - **Market cap is a second SYMBOL, not a mode.** TradingView caches bars per
 *   symbol, so a flag that changes what one symbol returns serves stale bars
 *   after a toggle. `buildMarketCapSymbol` produces `NOVA:MCAP`, and the
 *   separator is `:` and never `/` because the gateway's `/history` and
 *   `/symbols` both decide token-vs-pair with `symbol.includes("/")`.
 * - **No supply, no market cap.** Without a known positive supply the gateway's
 *   mcap symbol refuses to resolve, so the button is DISABLED and says why,
 *   rather than being hidden (which reads as a missing feature) or left to fail
 *   inside the widget (which reads as a broken chart).
 * - **Only a launched coin's history is exact.** `creator` is set only for
 *   tokens minted through CoinGenerator, whose `Coin` has no mint function and
 *   no owner — so its supply is fixed and today's figure holds at every point in
 *   the chart. For anything else (WETH, USDC…) supply moves, and applying
 *   today's number to past prices is an approximation. `hasFixedSupply` is what
 *   a caller renders that caveat from; it must not be presented as measured.
 *
 * NOT for pair charts. `/trade/pro` charts ETH/USDC, and a pair has two tokens,
 * so "market cap" names nothing there — and the `/` in a pair symbol routes to
 * `spotPairs`, where an mcap variant could never resolve anyway.
 */
export function useChartMetric(token: MetricToken) {
  const [metric, setMetric] = useState<ChartMetric>("price");

  const hasKnownSupply = typeof token.totalSupply === "number" && token.totalSupply > 0;
  const hasFixedSupply = Boolean(token.creator);
  const active = metric === "marketCap" && hasKnownSupply;

  return {
    metric,
    setMetric,
    hasKnownSupply,
    hasFixedSupply,
    /** True when the chart is actually showing market cap. */
    active,
    /** The UDF ticker to hand the chart. */
    chartSymbol: active ? buildMarketCapSymbol(token.symbol) : token.symbol,
    /** Human label for the "no market data" message — never the raw `:MCAP`. */
    metricLabel: active ? `${token.symbol} market cap` : token.symbol,
  };
}

export function ChartMetricToggle({
  metric,
  setMetric,
  hasKnownSupply,
  hasFixedSupply,
  symbol,
  className,
}: {
  metric: ChartMetric;
  setMetric: (m: ChartMetric) => void;
  hasKnownSupply: boolean;
  hasFixedSupply: boolean;
  symbol: string;
  className?: string;
}) {
  // One inline control reading `Price/MCap`, with the ACTIVE half carrying the
  // accent — the shape charting tools use for a metric switch, and the reason it
  // works is that both states stay legible at once: a segmented control tells you
  // what is selected, this tells you what is selected AND what the alternative is,
  // in the width of two words. Sits in the row above the chart rather than inside
  // the widget's own toolbar, which the charting library owns and does not expose.
  const on = "font-semibold text-[color:var(--m-primary)]";
  const off = "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]";

  return (
    <div
      className={cn("flex items-center gap-0.5 text-sm", className)}
      role="group"
      aria-label="Chart metric"
      title="Toggle between Price and Market Cap"
    >
      <button
        type="button"
        aria-pressed={metric === "price"}
        className={cn("transition-colors", metric === "price" ? on : off)}
        onClick={() => setMetric("price")}
      >
        Price
      </button>
      <span aria-hidden className="text-[color:var(--m-text-secondary-2)]">
        /
      </span>
      <button
        type="button"
        aria-pressed={metric === "marketCap"}
        disabled={!hasKnownSupply}
        title={
          !hasKnownSupply
            ? "Market cap unavailable — total supply unknown"
            : hasFixedSupply
              ? `Market cap = price × total supply. ${symbol}'s supply is fixed at launch, so this is exact.`
              : `Market cap = price × CURRENT total supply. ${symbol}'s supply can change over time, so historical values are an approximation, not a measurement.`
        }
        className={cn(
          "transition-colors",
          !hasKnownSupply
            ? "cursor-not-allowed text-[color:var(--m-text-secondary)] opacity-50"
            : metric === "marketCap"
              ? on
              : off,
        )}
        onClick={() => {
          if (hasKnownSupply) setMetric("marketCap");
        }}
      >
        MCap
      </button>
    </div>
  );
}

/**
 * The caveat that must travel with an approximate market-cap chart. Rendered by
 * the caller so it can sit wherever that page's layout wants it, but written
 * once so two surfaces cannot describe the same approximation differently.
 */
export function ChartMetricCaveat({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-[color:var(--m-text-secondary)]", className)}>
      Approximate — {symbol}&apos;s supply can change, so this chart applies today&apos;s
      total supply across the whole history shown.
    </p>
  );
}
