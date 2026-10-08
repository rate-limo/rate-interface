"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";

import { parseTradingViewSymbol } from "@iter/types";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getApiUrl } from "@/lib/realtime/ws-url";

// Same dynamic-import + ssr:false pattern as TradeDesktopPage — the widget
// touches `window` and the vendored charting_library script tags, neither of
// which exist during SSR.
const TradingViewChart = dynamic(() => import("./TradingViewChart"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[color:var(--m-surface-2)]" />,
});

type Availability = "checking" | "available" | "unavailable";

/**
 * Token profile's chart, gated on the token actually having a market to chart.
 *
 * The UDF prices a token directly against USD — `spotToken*Buckets`, keyed by the
 * bare symbol (e.g. "NOVA"), not a pair — so this passes the token's own symbol
 * straight through rather than resolving a pair first. `getTableFromResolution`
 * in apps/gateway/src/api/tradingview.ts branches on `isPair = symbol.includes("/")`
 * for exactly this reason.
 *
 * Preflights `/api/tradingview/history` (resolution "D", the whole `from=0` range)
 * before mounting the widget, because a token reaching this page already has a
 * `spotTokens` row (`getTokenBySymbol` in page.tsx would have thrown otherwise),
 * so a 404 essentially never happens here — the real, common signal is a 200
 * with an EMPTY `t` array: the token exists but has never had a bucket written,
 * which is what "pre-graduation, never traded" looks like from this table. Both
 * are treated as unavailable; only a non-empty `t` mounts the widget.
 *
 * Known gap, left alone on purpose: `/api/tradingview/symbols` (the `resolveSymbol`
 * UDF route) was NOT given the same isPair branch `/history` has — it only ever
 * queries `spotPairs`, so a bare token symbol never matches there. Confirmed live
 * against the RISE gateway: `/tradingview/symbols?symbol=WETH` returns
 * `{"ticker":"",...}` instead of a 404. This preflight does not compensate for
 * that — a token that passes it still mounts a widget whose `resolveSymbol` call
 * resolves to an empty ticker and fails inside the widget. Fixing it needs a
 * one-line gateway change (the same branch `/history` already has); apps/gateway
 * is out of scope for this pass.
 */
export function TokenProfileChart({
  networkName,
  symbol,
  interval,
  metricLabel,
  onAvailabilityChange,
}: {
  networkName: string;
  /**
   * The UDF ticker to chart — a bare token symbol ("NOVA") for price, or the
   * market-cap variant ("NOVA:MCAP", built by `buildMarketCapSymbol` from
   * `@iter/types`) for market cap. This component doesn't know or care which
   * one it is: the preflight and the widget both just chart whatever ticker
   * they're given.
   */
  symbol: string;
  interval: string;
  /**
   * What to call the thing being charted in the "no market data" message.
   * Defaults to `symbol`, which is wrong for the market-cap ticker (a reader
   * should not see "No market data for NOVA:MCAP yet") — the caller passes a
   * human label ("NOVA market cap") when it's charting anything other than
   * plain price.
   */
  metricLabel?: string;
  /**
   * Fires whenever the availability check settles. The interval/timeframe
   * buttons live in the parent (they also drive the label above the chart),
   * so this is how a caller hides them once it's known there's no chart for
   * them to control — otherwise they'd sit there as dead controls next to
   * the "no market data" line, which is exactly the failure this file's docs
   * warn about for a chart with its own toolbar and no connection to them.
   */
  onAvailabilityChange?: (availability: Availability) => void;
}) {
  const [availability, setAvailability] = useState<Availability>("checking");

  useEffect(() => {
    let cancelled = false;
    setAvailability("checking");
    onAvailabilityChange?.("checking");

    const apiUrl = getApiUrl(networkName);
    if (!apiUrl || !symbol) {
      setAvailability("unavailable");
      onAvailabilityChange?.("unavailable");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const url = `${apiUrl}/api/tradingview/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=0&to=${now}`;

    gatewayFetch(url)
      .then(async (res) => {
        if (cancelled) return;
        // 404 ("Symbol not found") means no `spotTokens` row at all — rare here,
        // since reaching this page already required one to resolve. The common
        // case is a 200 with an empty `t`: the row exists but nothing has ever
        // written a bucket for it, i.e. no trading has happened yet.
        if (res.status === 404) {
          setAvailability("unavailable");
          onAvailabilityChange?.("unavailable");
          return;
        }
        const body = await res.json().catch(() => null);
        const next = Array.isArray(body?.t) && body.t.length > 0 ? "available" : "unavailable";
        setAvailability(next);
        onAvailabilityChange?.(next);
      })
      .catch(() => {
        // A network hiccup preflighting the check is not the same claim as "this
        // token was never listed" — fall through to the widget and let its own
        // error handling take it from there instead of asserting an empty state
        // we don't actually know to be true.
        if (!cancelled) {
          setAvailability("available");
          onAvailabilityChange?.("available");
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onAvailabilityChange
    // is expected to be a fresh closure per render; keying off it would re-run
    // the network check on every parent render instead of only when the chart
    // itself changes.
  }, [networkName, symbol]);

  if (availability === "checking") {
    return <div className="h-full w-full animate-pulse bg-[color:var(--m-surface-2)]" />;
  }

  if (availability === "unavailable") {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-[color:var(--m-text-secondary)]">
        No market data for {metricLabel ?? parseTradingViewSymbol(symbol).base} yet.
      </div>
    );
  }

  return <TradingViewChart networkName={networkName} symbol={symbol} interval={interval} />;
}
