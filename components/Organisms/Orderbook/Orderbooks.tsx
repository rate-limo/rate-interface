import { useTradePageContext } from "@/contexts/TradePageProvider";
import { GroupedOrder } from "@/types/tables";
import { motion } from "motion/react";
import { adjustDecimalLength } from "@/utils/number";
import { useState } from "react";
import { FLASH_MS, useFlashingLevels } from "@/hooks/useFlashingLevels";
import { levelKey } from "@/lib/orderbook/flash";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { usePairLiquidityRanges } from "@/hooks/usePairLiquidityRanges";
import { poolSideInventory } from "@/lib/pair/derive";
import { compactNumber } from "@/lib/format/compact";
import { useLadderPick } from "./useLadderPick";
import { formatPrice, formatTickPrice } from "@/lib/format/price";
import { formatBookSize } from "@/lib/orderbook/size";
import { useOwnBookLevels } from "@/hooks/useOwnBookLevels";
import type { OwnLevel } from "@/lib/orderbook/ownLevels";

export default function Orderbooks() {
  const {
    pair,
    orderbookComputed,
    step,
    setStep,
  } = useTradePageContext();
  const [mode, setMode] = useState<"buy/sell" | "buy" | "sell">("buy/sell");
  const [showDropdown, setShowDropdown] = useState(false);
  const { pickAsk, pickBid } = useLadderPick();
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
  // The wallet's own resting orders, keyed like the rows: one Map.get per row.
  const own = useOwnBookLevels();

  /*
   * The POOL's depth, which this ladder did not show at all.
   *
   * A taker crossing this book fills from whichever venue holds the liquidity —
   * the indexed trades carry `origins: { pool, maker }` for exactly that reason
   * — so a ladder built from resting orders alone understates what can actually
   * be filled. On a banded market it understates it badly: measured on Arc's
   * ITRA/USDC, the book held one bid and the pool held 998 ITRA against it.
   *
   * Three states, the same distinction `poolExists` was added for: no pool
   * contributes nothing and claims nothing, a pool with no bands contributes
   * zero, and a FAILED read contributes nothing rather than rendering as an
   * empty pool.
   */
  const { displayNetworkName } = useMarketPageContext();
  const liquidityRanges = usePairLiquidityRanges(
    displayNetworkName,
    pair.base.id,
    pair.quote.id,
    40,
  );
  const bands =
    liquidityRanges.data?.poolExists === true && !liquidityRanges.isError
      ? (liquidityRanges.data.ranges ?? [])
      : [];
  const noPool = liquidityRanges.data?.poolExists === false && !liquidityRanges.isError;
  const askPool = poolSideInventory(bands, "ask");
  const bidPool = poolSideInventory(bands, "bid");

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
        {/* FIRST child of a `flex-col-reverse` container renders at the BOTTOM,
            which is the edge against the spread — and that is where a band
            belongs: it sits at ±0.02–0.10% of spot, tighter than almost
            anything resting. */}
        <PoolRow side="ask" pool={askPool} symbol={pair.base.symbol} />
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
            onClick={() => pickAsk(order)}
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
            <PriceCell className="text-red-400" price={formatTickPrice(order.price, step)} mine={own.asks.get(levelKey(order.price))} />
            <div className="px-3 text-right text-[color:var(--m-text-primary)]">{formatBookSize(order.baseLiquidity)}</div>
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
              <span className="relative">{formatBookSize(order.accumulatedQuoteLiquidity)}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Spread */}
      <div className="grid h-8 shrink-0 grid-cols-3 items-center border-y border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 text-[11px] tabular-nums">
        <div className="text-[color:var(--m-text-secondary)]">Spread</div>
        <div className="text-[color:var(--m-text-primary)]">
          {orderbookComputed?.spread == null ? "—" : formatTickPrice(orderbookComputed.spread, step)}
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
        {/* Top of a normal-flow container is likewise the edge against the
            spread. A bid fills from the pool's QUOTE inventory, an ask from its
            BASE — each side names the leg it would actually consume. */}
        {noPool ? <NoPoolRow /> : <PoolRow side="bid" pool={bidPool} symbol={pair.quote.symbol} />}
        {buyOrders?.map((order) => (
          <motion.div
            key={`buy-${order.price}`}
            className="group relative grid h-6 shrink-0 cursor-pointer grid-cols-3 text-[11px] tabular-nums transition-colors duration-[120ms] hover:bg-[color:var(--m-success)]/12 motion-reduce:transition-none"
            onClick={() => pickBid(order)}
            style={{ position: "relative" }}
          >
            {flashingBids.has(levelKey(order.price)) && (
              <span
                aria-hidden
                className="orderbook-flash pointer-events-none absolute inset-0 bg-[color:var(--m-success)]"
                style={{ animation: `orderbook-flash ${FLASH_MS}ms ease-out forwards` }}
              />
            )}
            <PriceCell className="text-green-400" price={formatTickPrice(order.price, step)} mine={own.bids.get(levelKey(order.price))} />
            <div className="px-3 text-right text-[color:var(--m-text-primary)]">{formatBookSize(order.baseLiquidity)}</div>
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
              <span className="relative">{formatBookSize(order.accumulatedQuoteLiquidity)}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}

/**
 * The band pool's inventory on one side — a LINE, never a ladder row.
 *
 * Every other row here is clickable and sets the limit price to its own price.
 * A band has no single price: it holds an amount across an interval, and at
 * ±0.02% that interval is narrower than the gap between two adjacent rows. So
 * it renders in the same three columns for alignment, prints its own range
 * instead of a price, and takes no click — there is no one rate to commit to.
 *
 * Hatched in the side's colour rather than given a third hue, the same rule the
 * depth chart and the pair profile's ladder already follow: the pool is not a
 * third kind of liquidity, it is the same depth from another venue.
 */
export function PoolRow({
  side,
  pool,
  symbol,
}: {
  side: "bid" | "ask";
  /** Null where the pool holds none of this side's leg — then nothing renders. */
  pool: { amount: number; minPrice: number; maxPrice: number } | null;
  symbol: string;
}) {
  if (!pool) return null;
  const colour = side === "bid" ? "var(--m-success)" : "var(--m-error)";
  return (
    <div
      className="grid h-6 shrink-0 grid-cols-3 items-center overflow-hidden text-[11px] tabular-nums"
      title={`Pool liquidity, available across ${formatPrice(pool.minPrice, 6)}–${formatPrice(pool.maxPrice, 6)}`}
    >
      <div className="flex items-center gap-1.5 px-3">
        <span
          aria-hidden
          className="h-2.5 w-4 shrink-0 rounded-[2px]"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, color-mix(in srgb, ${colour} 45%, transparent) 2px, color-mix(in srgb, ${colour} 45%, transparent) 4px)`,
          }}
        />
        <span className="text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary)]">
          pool
        </span>
      </div>
      <div className="truncate whitespace-nowrap px-3 text-right text-[color:var(--m-text-secondary)]">
        {poolAmountLabel(pool.amount)} {symbol}
      </div>
      {/*
        The band's REACH as a half-width, not its two absolute bounds.
        
        Two six-figure prices do not fit a column sized for one, and every
        attempt to make them was worse than the last: at full precision they
        wrapped and overlapped the level below, at four digits 1.01958–1.02162
        rendered as "1.02–1.022" and hid that the band reaches below spot, and
        truncating clipped a price behind an ellipsis.
        
        A half-width says it exactly and in six characters, because a band IS
        symmetric: `BandPool` prices a fill at `marketPrice * (DENOM ±
        tolerance) / DENOM`, so ±0.10% is not a summary of the bounds, it is
        what the bounds were computed FROM. The absolute pair stays in the
        title for anyone who wants it.
      */}
      <div className="truncate whitespace-nowrap px-3 text-right text-[9.5px] text-[color:var(--m-text-secondary-2)]">
        ±{bandHalfWidthPct(pool.minPrice, pool.maxPrice)}%
      </div>
    </div>
  );
}

/**
 * A level's price, with a dot when the connected wallet has an order resting on
 * it. The dot sits in the cell's left padding so the price column never shifts;
 * the title says how much is yours.
 */
export function PriceCell({ price, className, mine }: { price: string; className: string; mine?: OwnLevel }) {
  return (
    <div
      className={`relative px-3 ${className}`}
      data-mine={mine ? "" : undefined}
      title={mine ? `Yours: ${formatBookSize(mine.size)} ${mine.symbol}` : undefined}
    >
      {mine && (
        <span
          aria-label={`Yours: ${formatBookSize(mine.size)} ${mine.symbol}`}
          className="absolute left-1 top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-[color:var(--m-primary)]"
        />
      )}
      {price}
    </div>
  );
}

/**
 * The pool's inventory, short enough for a third of a phone-width column.
 * "199,000,000 KPRF1448" truncated to "199,000,000 KPR…" — the symbol, the one
 * part that says WHAT the pool holds, was the part cut. Exact below 10,000
 * (the column has room and small pools are where precision matters).
 */
export function poolAmountLabel(amount: number): string {
  return Math.abs(amount) >= 10_000 ? compactNumber(amount) : adjustDecimalLength(amount, 5);
}

/**
 * Said, not implied: a market with NO pool used to render a ladder of resting
 * orders and nothing else, which reads as "the pool information is missing".
 * Only when the gateway answered "pool not found" — a failed read stays
 * silent, the distinction `poolExists` exists to keep.
 */
export function NoPoolRow() {
  return (
    <div
      className="flex h-6 shrink-0 items-center gap-1.5 px-3 text-[10px] text-[color:var(--m-text-secondary-2)]"
      title="This market trades on the order book only. Pairs with a wrapped-native leg (ETH via WETH) never get a band pool."
    >
      <span aria-hidden className="h-2.5 w-4 shrink-0 rounded-[2px] border border-dashed border-[color:var(--m-border)]" />
      <span className="uppercase tracking-wide">no pool</span>
      <span className="truncate">on this market · orders only</span>
    </div>
  );
}

/**
 * How far a band reaches either side of spot, as a percentage.
 *
 * Derived from the bounds rather than read from `tolerance`, which the web
 * never receives — `bandsToRanges` consumes it server-side and returns the two
 * prices. The midpoint of a symmetric interval is the market price it was built
 * around, so this recovers the tolerance exactly.
 */
export function bandHalfWidthPct(minPrice: number, maxPrice: number): string {
  const mid = (minPrice + maxPrice) / 2;
  if (!(mid > 0) || !(maxPrice > minPrice)) return "0";
  const pct = ((maxPrice - mid) / mid) * 100;
  // Two decimals holds Arc's tightest band (0.02%) without rounding it to zero,
  // which would read as a band with no width at all.
  return pct >= 0.01 ? pct.toFixed(2) : pct.toPrecision(1);
}
