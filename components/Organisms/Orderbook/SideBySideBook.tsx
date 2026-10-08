"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTradePageContext } from "@/contexts/TradePageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { usePairLiquidityRanges } from "@/hooks/usePairLiquidityRanges";
import { FLASH_MS, useFlashingLevels } from "@/hooks/useFlashingLevels";
import { levelKey } from "@/lib/orderbook/flash";
import { poolSideInventory } from "@/lib/pair/derive";
import type { GroupedOrder } from "@/types/tables";
import { formatTickPrice } from "@/lib/format/price";
import { formatBookSize } from "@/lib/orderbook/size";
import type { OwnLevel } from "@/lib/orderbook/ownLevels";
import { useOwnBookLevels } from "@/hooks/useOwnBookLevels";
import { cn } from "@/lib/utils";
import { bandHalfWidthPct, poolAmountLabel } from "./Orderbooks";
import { useLadderPick } from "./useLadderPick";

/**
 * The phone order book: bids and asks SIDE BY SIDE on the same rows, prices
 * meeting in the middle, depth bars growing outward (Hyperliquid's mobile book,
 * adopted 2026-10-04).
 *
 * The stacked ladder gave each side half of a half-screen panel after ~130px of
 * title, mode icons, column labels and a spread row — about 5 levels a side.
 * One row per PAIR of levels, one control row and no spread row fits ~16 in the
 * same height. The spread is the gap between the two top prices.
 *
 * Same data, same flash, same tap as the desktop ladder: `orderbookComputed`
 * from the trade context, `useFlashingLevels` (a level flashes when its OWN size
 * changes, never on reduced motion), and `useLadderPick` for what a tap does.
 */
export default function SideBySideBook() {
  const { pair, orderbookComputed, step, setStep } = useTradePageContext();
  const { displayNetworkName } = useMarketPageContext();
  const [scalesOpen, setScalesOpen] = useState(false);
  const asks: GroupedOrder[] = orderbookComputed?.asks?.buckets ?? [];
  const bids: GroupedOrder[] = orderbookComputed?.bids?.buckets ?? [];
  const flashingAsks = useFlashingLevels(asks);
  const flashingBids = useFlashingLevels(bids);
  const { pickAsk, pickBid } = useLadderPick();
  const own = useOwnBookLevels();

  const ranges = usePairLiquidityRanges(displayNetworkName, pair.base.id, pair.quote.id, 40);
  const bands = ranges.data?.poolExists === true && !ranges.isError ? (ranges.data.ranges ?? []) : [];
  const noPool = ranges.data?.poolExists === false && !ranges.isError;
  const bidPool = poolSideInventory(bands, "bid");
  const askPool = poolSideInventory(bands, "ask");

  const rows = Math.max(bids.length, asks.length);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--m-background)] text-[11px] text-[color:var(--m-text-primary)]">
      {/* One control row: price grouping and the unit the totals are in. */}
      <div className="relative flex h-8 shrink-0 items-center justify-between px-3 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={scalesOpen}
          aria-label="Price grouping"
          onClick={() => setScalesOpen((open) => !open)}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[color:var(--m-text-primary)] active:bg-[color:var(--m-surface-2)]"
        >
          {step} <span aria-hidden>▾</span>
        </button>
        {scalesOpen && (
          <div role="listbox" className="absolute left-2 top-8 z-10 min-w-[72px] rounded-md border border-[color:var(--m-border)] bg-[color:var(--m-surface)] py-1 shadow-lg">
            {pair.scales.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === step}
                onClick={() => {
                  setStep(option);
                  setScalesOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-[color:var(--m-text-primary)] active:bg-[color:var(--m-surface-2)]"
              >
                {option}
              </button>
            ))}
          </div>
        )}
        <span>{pair.base.symbol}</span>
      </div>

      <div className="grid shrink-0 grid-cols-2 px-0 pb-1 text-[10px] text-[color:var(--m-text-secondary-2)]">
        <div className="flex justify-between px-3">
          <span>Total</span>
          <span>Bid</span>
        </div>
        <div className="flex justify-between px-3">
          <span>Ask</span>
          <span>Total</span>
        </div>
      </div>

      <div data-testid="side-by-side-book" className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* The pool first on each side: it sits within ±0.02–0.10% of spot,
            tighter than almost anything resting. */}
        {noPool ? (
          <div
            className="flex h-6 items-center gap-1.5 px-3 text-[10px] text-[color:var(--m-text-secondary-2)]"
            title="This market trades on the order book only. Pairs with a wrapped-native leg (ETH via WETH) never get a band pool."
          >
            <span aria-hidden className="h-2.5 w-4 shrink-0 rounded-[2px] border border-dashed border-[color:var(--m-border)]" />
            <span className="uppercase tracking-wide">no pool</span>
            <span className="truncate">on this market · orders only</span>
          </div>
        ) : (bidPool || askPool) && (
          <div className="grid h-6 grid-cols-2 font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]" title="Pool liquidity">
            <PoolCell side="bid" text={bidPool ? `${poolAmountLabel(bidPool.amount)} ${pair.quote.symbol}` : ""} reach={bidPool ? bandHalfWidthPct(bidPool.minPrice, bidPool.maxPrice) : null} />
            <PoolCell side="ask" text={askPool ? `${poolAmountLabel(askPool.amount)} ${pair.base.symbol}` : ""} reach={askPool ? bandHalfWidthPct(askPool.minPrice, askPool.maxPrice) : null} />
          </div>
        )}

        {Array.from({ length: rows }, (_, i) => {
          const bid = bids[i];
          const ask = asks[i];
          return (
            <div key={`${bid?.price ?? "-"}|${ask?.price ?? "-"}|${i}`} className="grid h-[22px] grid-cols-2 font-dm-mono tabular-nums">
              {bid ? (
                <Level side="bid" order={bid} step={step} mine={own.bids.get(levelKey(bid.price))} flash={flashingBids.has(levelKey(bid.price))} onPick={() => pickBid(bid)} />
              ) : (
                <div />
              )}
              {ask ? (
                <Level side="ask" order={ask} step={step} mine={own.asks.get(levelKey(ask.price))} flash={flashingAsks.has(levelKey(ask.price))} onPick={() => pickAsk(ask)} />
              ) : (
                <div />
              )}
            </div>
          );
        })}

        {rows === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-[color:var(--m-text-secondary-2)]">No resting orders yet.</div>
        )}
      </div>
    </div>
  );
}

/** How long a press must last to read as "show me mine" rather than a tap. */
const LONG_PRESS_MS = 450;
/** How long the "Yours" label stays up after a long-press. */
const MINE_LABEL_MS = 2500;

function Level({
  side,
  order,
  step,
  mine,
  flash,
  onPick,
}: {
  side: "bid" | "ask";
  order: GroupedOrder;
  step: string;
  /** The connected wallet's resting orders on this level, if any. */
  mine?: OwnLevel;
  flash: boolean;
  onPick: () => void;
}) {
  const bid = side === "bid";
  const total = formatBookSize(order.accumulatedBaseLiquidity);
  const price = formatTickPrice(order.price, step);
  const mineText = mine ? `Yours: ${formatBookSize(mine.size)} ${mine.symbol}`.trim() : null;

  /*
   * A tap already sets the limit price, so "how much of this is mine" needs a
   * gesture of its own: a long-press shows it in place and swallows the click
   * that follows, so reading your size never also moves your ticket.
   */
  const [showMine, setShowMine] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(
    () => () => {
      cancelPress();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <motion.button
      type="button"
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onPick();
      }}
      onPointerDown={() => {
        if (!mine) return;
        cancelPress();
        pressTimer.current = setTimeout(() => {
          suppressClick.current = true;
          setShowMine(true);
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(() => setShowMine(false), MINE_LABEL_MS);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        // iOS/Android raise a context menu on the same long-press.
        if (mine) e.preventDefault();
      }}
      data-side={side}
      data-price={order.price}
      data-flash={flash || undefined}
      data-mine={mine ? "" : undefined}
      title={mineText ?? undefined}
      aria-label={`${bid ? "Bid" : "Ask"} ${price}, total ${total}${mineText ? `, ${mineText}` : ""}`}
      className="relative flex items-center justify-between overflow-hidden px-3 text-[11px]"
      // The flash: the level's own row tints when ITS size changed, from
      // `useFlashingLevels`; the duration is the hook's, so the highlight never
      // outlives or is cut short by the state that triggered it.
      animate={{
        backgroundColor: flash
          ? bid
            ? "rgba(110, 158, 124, 0.32)"
            : "rgba(190, 113, 104, 0.32)"
          : "rgba(0, 0, 0, 0)",
      }}
      transition={{ duration: FLASH_MS / 1000 }}
    >
      {/* Depth grows OUTWARD from the middle: bids from their right edge,
          asks from their left. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-px transition-[width] duration-300",
          bid ? "right-0 bg-green-400/15" : "left-0 bg-red-400/15",
        )}
        style={{ width: `${order.accumulatedPercentage}%` }}
      />
      {/* Your level: a dot on the OUTER edge, clear of both numbers. */}
      {mine && (
        <span
          aria-hidden
          data-testid="own-dot"
          className={cn(
            "absolute top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-[color:var(--m-primary)]",
            bid ? "left-1" : "right-1",
          )}
        />
      )}
      {showMine && mineText && (
        <span
          role="status"
          className="absolute inset-0 z-[1] flex items-center justify-center bg-[color:var(--m-surface)] text-[10.5px] text-[color:var(--m-text-primary)]"
        >
          {mineText}
        </span>
      )}
      {bid ? (
        <>
          <span className="relative text-[color:var(--m-text-primary)]">{total}</span>
          <span className="relative text-green-400">{price}</span>
        </>
      ) : (
        <>
          <span className="relative text-red-400">{price}</span>
          <span className="relative text-[color:var(--m-text-primary)]">{total}</span>
        </>
      )}
    </motion.button>
  );
}

function PoolCell({ side, text, reach }: { side: "bid" | "ask"; text: string; reach: string | null }) {
  if (!text) return <div />;
  const colour = side === "bid" ? "var(--m-success)" : "var(--m-error)";
  const hatch = `repeating-linear-gradient(45deg, transparent, transparent 2px, color-mix(in srgb, ${colour} 30%, transparent) 2px, color-mix(in srgb, ${colour} 30%, transparent) 4px)`;
  return (
    <div className={cn("flex items-center gap-1.5 overflow-hidden px-3", side === "bid" ? "justify-between" : "justify-between")} style={{ backgroundImage: hatch }}>
      {side === "bid" ? (
        <>
          <span className="truncate">pool · {text}</span>
          <span className="shrink-0 text-[9.5px] text-[color:var(--m-text-secondary-2)]">±{reach}%</span>
        </>
      ) : (
        <>
          <span className="shrink-0 text-[9.5px] text-[color:var(--m-text-secondary-2)]">±{reach}%</span>
          <span className="truncate">{text} · pool</span>
        </>
      )}
    </div>
  );
}
