import { useTradePageContext } from "@/contexts/TradePageProvider";
import { eventBus } from "@/utils/events";
import { formatPrice } from "@/lib/format/price";
import { formatBookSize } from "@/lib/orderbook/size";
import { format, isSameDay } from "date-fns";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** How long a filled row stays tinted. */
const FLASH_MS = 100;

/**
 * A trade's time — with its date when it is not from today. A quiet market's
 * tape can be days old, and "14:49:02" alone reads as this afternoon.
 * `timestamp` is in seconds.
 */
export function tradeTimeLabel(timestamp: number, now: Date = new Date()): string {
  const d = new Date(timestamp * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return isSameDay(d, now) ? format(d, "HH:mm:ss") : format(d, "MMM d HH:mm");
}

export default function Trades() {
  const { pair, recentTrades } = useTradePageContext();

  const [animatingTxHash, setAnimatingTxHash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The row flash, subscribed in an effect and removed on unmount.
   *
   * It used to subscribe in the component BODY behind a `useRef` guard, with no
   * `off` anywhere — so the handler outlived every mount that registered it.
   * `eventBus` is a module-level emitter shared by the whole app, which makes
   * that a permanent reference to this mount's `setAnimatingTxHash`, and through
   * it to an unmounted tree.
   *
   * Chain switching is what turned that into a real problem rather than a slow
   * one. Every chain's socket publishes onto this same bus, and switching chains
   * remounts this panel, so after k switches a single trade invoked k handlers —
   * each setting state on a dead tree and each starting its own timer. The cost
   * per trade grew with how long the tab had been open.
   *
   * A ref guard cannot fix that, because the thing that needs undoing is the
   * subscription, not the subscribing. Two further reasons this belongs in an
   * effect: subscribing during render is a side effect in render, so a discarded
   * concurrent render leaves a listener behind with no mount to clean it up; and
   * the flash timer needs cancelling too, or a trade landing just before a
   * navigation sets state 100ms after this component is gone.
   */
  useEffect(() => {
    const onTrade = (tradeEvent: { txHash: string }) => {
      setAnimatingTxHash(tradeEvent.txHash);
      // One timer, restarted: back-to-back fills previously each scheduled their
      // own, and the first to fire cleared the tint the later one had just set.
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setAnimatingTxHash(null), FLASH_MS);
    };

    eventBus.on("spot-trade-update", onTrade);
    return () => {
      eventBus.off("spot-trade-update", onTrade);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  return (
    <>
      {/* Headers */}
      <div className="grid w-full grid-cols-4 px-2 py-2 text-xs text-[color:var(--m-text-secondary)]">
        <div className="text-left px-2">Time</div>
        <div className="text-left">Price({pair.quote.symbol})</div>
        <div className="text-center">Size({pair.base.symbol})</div>
        <div className="text-right">Value({pair.quote.symbol})</div>
      </div>

      {/* Trades */}
      <div className="overflow-y-auto h-full hide-scrollbar flex flex-col justify-start items-between w-full">
        {recentTrades?.map((trade, index) => (
          <motion.div
            key={`${trade.txHash}-${trade.orderId}-${index}`}
            className="grid cursor-pointer grid-cols-4 text-xs text-[12px] hover:bg-[color:var(--m-surface-2)]"
            animate={
              animatingTxHash === trade.txHash
                ? {
                    backgroundColor: trade.isBid ? "rgba(71, 164, 125, 0.2)" : "rgba(255, 82, 82, 0.2)",
                    transition: { duration: 0.1 },
                  }
                : {}
            }
          >
            <div className="px-2 py-1 text-[color:var(--m-text-primary)]">{tradeTimeLabel(Number(trade.timestamp))}</div>
            <div className={`px-2 py-1 ${trade.isBid ? "text-green-400" : "text-red-400"}`}>{formatPrice(trade.price)}</div>
            <div className="px-2 py-1 text-[color:var(--m-text-primary)]">
              {formatBookSize(trade?.baseAmount)}
            </div>
            <div className="relative px-2 py-1 text-center text-[color:var(--m-text-primary)]">
              {formatBookSize(trade?.quoteAmount)}
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
