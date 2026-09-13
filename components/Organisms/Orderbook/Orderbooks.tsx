import { useTradePageContext } from "@/contexts/TradePageProvider";
import { GroupedOrder } from "@/types/tables";
import { motion } from "motion/react";
import { adjustDecimalLength, roundToDecimal } from "@/utils/number";
import { useState } from "react";
import { FLASH_MS, useFlashingLevels } from "@/hooks/useFlashingLevels";
import { levelKey } from "@/lib/orderbook/flash";

export default function Orderbooks() {
  const {
    pair,
    orderbookComputed,
    step,
    setStep,
    setLimitPrice,
    isBid,
    setQuoteAmount,
    setBaseAmount,
    setAmount,
  } = useTradePageContext();
  const [mode, setMode] = useState<"buy/sell" | "buy" | "sell">("buy/sell");
  const [showDropdown, setShowDropdown] = useState(false);
  const sellOrders: GroupedOrder[] = orderbookComputed?.asks?.buckets ?? [];
  const buyOrders: GroupedOrder[] = orderbookComputed?.bids?.buckets ?? [];

  /*
   * Flash the rows that MOVED, both sides, from the data.
   *
   * This replaces a subscription to `spot-orderblock-update` that was made in
   * the render body behind a ref and never torn down — one leaked listener per
   * mount, each still calling setState after its component was gone. It also
   * tracked a SINGLE price, so a flush that moved four levels lit one of them.
   *
   * Diffing snapshots fixes both and is more accurate besides: an event names a
   * level that was touched, which is not the same as one whose size changed,
   * and `frameBuffer` batches several real changes into one render anyway.
   */
  const flashingAsks = useFlashingLevels(sellOrders);
  const flashingBids = useFlashingLevels(buyOrders);

  return (
    <>
      {/* Orderbook Mode/Scale/menu */}
      <div className="my-1 flex h-8 shrink-0 flex-row justify-between px-2">
        {/* Orderbook Mode */}
        <div className="flex flex-row justify-center items-center space-x-2">
          <button
            type="button"
            className="flex h-7 w-7 cursor-pointer flex-col items-center justify-center rounded-[3px] hover:bg-[color:var(--m-surface-2)]"
            onClick={() => {
              setMode("buy/sell");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
            >
              <title>Buy/Sell Mode Icon</title>
              <path d="M4 4h7v7H4V4z" fill="var(--m-chart-sell)" />
              <path d="M4 13h7v7H4v-7z" fill="var(--m-chart-buy)" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M13 4h7v4h-7V4zm0 6h7v4h-7v-4zm7 6h-7v4h7v-4z"
                fill="var(--m-text-secondary)"
              />
            </svg>
          </button>
          <button
            type="button"
            className="flex h-7 w-7 cursor-pointer flex-col items-center justify-center rounded-[3px] hover:bg-[color:var(--m-surface-2)]"
            onClick={() => {
              setMode("buy");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
            >
              <title>Buy Mode Icon</title>
              <path d="M4 4h7v16H4V4z" fill="var(--m-chart-buy)" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M13 4h7v4h-7V4zm0 6h7v4h-7v-4zm7 6h-7v4h7v-4z"
                fill="var(--m-text-secondary)"
              />
            </svg>
          </button>
          <button
            type="button"
            className="flex h-7 w-7 cursor-pointer flex-col items-center justify-center rounded-[3px] hover:bg-[color:var(--m-surface-2)]"
            onClick={() => {
              setMode("sell");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
            >
              <title>Sell Mode Icon</title>
              <path d="M4 4h7v16H4V4z" fill="var(--m-chart-sell)" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M13 4h7v4h-7V4zm0 6h7v4h-7v-4zm7 6h-7v4h7v-4z"
                fill="var(--m-text-secondary)"
              />
            </svg>
          </button>
        </div>
        {/* Orderbook Scale */}
        <div
          className="relative flex flex-row items-center justify-between space-x-2 rounded-md px-2 hover:bg-[color:var(--m-surface-2)]"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div
            id="tick-content"
            className="flex flex-row space-x-2 w-[48px] justify-between items-start"
          >
            <span className="text-[12px] text-[color:var(--m-text-primary)]">{step}</span>
            <button type="button" className="cursor-pointer">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="var(--m-text-primary)"
                className="w-4 h-4 hover:fill-white"
              >
                <title>Dropdown Icon</title>
                <path
                  d="M16.5 8.49v2.25L12 15.51l-4.5-4.77V8.49h9z"
                  fill="var(--m-text-primary)"
                />
              </svg>
            </button>
            {showDropdown && (
              <div className="absolute left-[-20px] z-10 mt-6 min-w-[66px] rounded-md border border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-lg">
                <div className="py-1">
                  {pair.scales.map((option) => (
                    <button
                      type="button"
                      key={option}
                      className="block w-full px-4 py-2 text-sm text-[color:var(--m-text-primary)] hover:bg-[color:var(--m-surface-2)]"
                      onClick={() => setStep(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Headers */}
      <div className="grid shrink-0 grid-cols-3 px-3 py-1 text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary)]">
        <div>Price</div>
        <div>Size({pair.base.symbol})</div>
        <div>Total({pair.quote.symbol})</div>
      </div>


      {/* Sell Orders */}
      <div className="hide-scrollbar flex min-h-0 flex-1 flex-col-reverse justify-start overflow-y-auto">
        {sellOrders?.map((order) => (
          <motion.div
            key={`sell-${order.price}`}
            /*
             * Hover is SIDE-TINTED, not neutral grey.
             *
             * Every row here is already a decision: clicking one sets the limit
             * price on that side. A grey highlight says "this row" and stops
             * there; a red one says which side of the book the click commits to,
             * which is the thing that costs money to get wrong.
             *
             * `transition-colors` rather than an instant swap so the pointer
             * moving down the ladder reads as one continuous motion instead of
             * a strobe — 120ms is under the ~150ms where a hover starts to feel
             * laggy, and it shares `motion-reduce` with the flash.
             */
            className="group relative grid h-6 w-full shrink-0 cursor-pointer grid-cols-3 text-[11px] tabular-nums transition-colors duration-[120ms] hover:bg-[color:var(--m-error)]/12 motion-reduce:transition-none"
            onClick={() => {
              setLimitPrice(Number(order.price));
              if (isBid) {
                setAmount(
                  roundToDecimal(Number(order.accumulatedQuoteLiquidity), 6).toString()
                );
                setQuoteAmount(
                  roundToDecimal(Number(order.accumulatedQuoteLiquidity), 6)
                );
                setBaseAmount(
                  roundToDecimal(
                    Number(order.accumulatedQuoteLiquidity) /
                      Number(order.price),
                    6
                  )
                );
              }
            }}
            animate={
              flashingAsks.has(levelKey(order.price))
                ? { backgroundColor: "rgba(255, 82, 82, 0.2)" }
                : { backgroundColor: "rgba(255, 82, 82, 0)" }
            }
            // Driven from FLASH_MS so the highlight cannot outlive, or be cut
            // short by, the state that triggered it — the previous pairing was
            // a 300ms transition cleared at 100ms.
            transition={{ duration: FLASH_MS / 1000 }}
          >
            <div className="px-3 text-red-400">{adjustDecimalLength(Number(order.price), 6)}</div>
            <div className="px-3 text-right text-[color:var(--m-text-primary)]">{adjustDecimalLength(Number(order.baseLiquidity), 6)}</div>
            <div className="relative px-3 text-right text-[color:var(--m-text-primary)]">
              {/* Background for this column only on percentage of orderbook */}
              <div
                className="absolute inset-0 bg-red-400/20 transition-all duration-300"
                style={{ width: `${order.percentage}%` }}
              />
              {/* Background for this column only on accumulated percentage of orderbook */}
              <div
                className="absolute inset-0 bg-red-400/20 transition-all duration-300"
                style={{ width: `${order.accumulatedPercentage}%` }}
              />
              {adjustDecimalLength(Number(order.accumulatedQuoteLiquidity), 6)}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Spread */}
      <div className="grid h-8 shrink-0 grid-cols-3 items-center border-y border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 text-[11px] tabular-nums">
        <div className="text-[color:var(--m-text-secondary)]">Spread</div>
        <div className="text-[color:var(--m-text-primary)]">
          {adjustDecimalLength(Number(orderbookComputed?.spread), 6)}
        </div>
        <div className="text-[color:var(--m-text-primary)]">
          {orderbookComputed?.spreadPercentage
            ? orderbookComputed?.spreadPercentage
            : "0.00"}
          %
        </div>
      </div>

      {/* Buy Orders */}
      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        {buyOrders?.map((order) => (
          <motion.div
            key={`buy-${order.price}`}
            className="group relative grid h-6 shrink-0 cursor-pointer grid-cols-3 text-[11px] tabular-nums transition-colors duration-[120ms] hover:bg-[color:var(--m-success)]/12 motion-reduce:transition-none"
            onClick={() => {
              setLimitPrice(Number(order.price));
              if (!isBid) {
                setAmount(
                  roundToDecimal(Number(order.accumulatedBaseLiquidity), 6).toString()
                );
                setBaseAmount(
                  roundToDecimal(Number(order.accumulatedBaseLiquidity), 6)
                );
                setQuoteAmount(
                  roundToDecimal(
                    Number(order.accumulatedBaseLiquidity) *
                      Number(order.price),
                    6
                  )
                );
              }
            }}
            style={{ position: "relative" }}
          >
            {flashingBids.has(levelKey(order.price)) && (
              <span
                aria-hidden
                className="orderbook-flash pointer-events-none absolute inset-0 bg-[color:var(--m-success)]"
                style={{ animation: `orderbook-flash ${FLASH_MS}ms ease-out forwards` }}
              />
            )}
            <div className="px-3 text-green-400">{adjustDecimalLength(Number(order.price), 6)}</div>
            <div className="px-3 text-right text-[color:var(--m-text-primary)]">{adjustDecimalLength(Number(order?.baseLiquidity), 6)}</div>
            <div className="relative px-3 text-right text-[color:var(--m-text-primary)]">
              {/* Background for this column only on percentage of orderbook */}
              <div
                className="absolute inset-0 bg-green-400/20 transition-all duration-300"
                style={{ width: `${order.percentage}%` }}
              />
              {/* Background for this column only on accumulated percentage of orderbook */}
              <div
                className="absolute inset-0 bg-green-400/20 transition-all duration-300"
                style={{ width: `${order.accumulatedPercentage}%` }}
              />
              {adjustDecimalLength(Number(order?.accumulatedQuoteLiquidity), 6)}
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
