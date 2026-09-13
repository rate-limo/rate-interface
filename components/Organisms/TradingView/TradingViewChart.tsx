"use client";

/*
 * PUBLIC MIRROR STUB — TradingView's Charting Library is not redistributable.
 *
 * The private repository renders TradingView's Charting Library (v28.4.0) from
 * `public/tradingview/`, wired to a custom datafeed over the indexer's
 * websocket. That library is licensed to Iter and its licence forbids
 * redistribution, so neither the vendored bundle nor the widget wiring is in
 * this repository — this is a licence constraint, not a secrecy one.
 *
 * The props are unchanged, so every caller compiles and lays out exactly as it
 * does in the private build. To run a real chart here, obtain your own
 * Charting Library licence from TradingView, drop the bundle into
 * `public/tradingview/`, and implement a datafeed against your own candles.
 *
 * `components/Chart/ThesisChart.tsx` is NOT stubbed: it is built on
 * lightweight-charts, which is Apache-2.0, and is the chart the token profile
 * actually uses.
 */
function TradingViewChart({
  networkName,
  symbol = "ETH/USDC",
  interval = "1H" as string,
}: {
  networkName: string;
  symbol: string;
  interval: string;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-6 text-center"
      data-testid="tradingview-stub"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[13.5px] font-medium text-[color:var(--m-text-primary)]">
          Chart not included in the open-source build
        </p>
        <p className="font-dm-mono text-[11px] leading-relaxed text-[color:var(--m-text-secondary)]">
          TradingView&rsquo;s Charting Library is licensed and cannot be redistributed.
          <br />
          {symbol} &middot; {interval} &middot; {networkName}
        </p>
      </div>
    </div>
  );
}

export default TradingViewChart;
