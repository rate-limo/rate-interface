import { useTradePageContext } from "@/contexts/TradePageProvider";
import { getTime } from "@/utils/datetime";
import { eventBus } from "@/utils/events";
import { adjustDecimalLength } from "@/utils/number";
import { motion } from "motion/react";
import { useRef, useState } from "react";

export default function Trades() {
  const { pair, recentTrades } = useTradePageContext();

  const [animatingTxHash, setAnimatingTxHash] = useState<string | null>(null);
  const isSubscribed = useRef(false);

  // get event from eventBus
  if (!isSubscribed.current) {
    isSubscribed.current = true;
    eventBus.on('spot-trade-update', (tradeEvent) => {
      console.log("tradeEvent", tradeEvent);
      setAnimatingTxHash(tradeEvent.txHash);
      setTimeout(() => {
        setAnimatingTxHash(null);
      }, 100);
    });
  }

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
            <div className="px-2 py-1 text-[color:var(--m-text-primary)]">{getTime(Number(trade.timestamp))}</div>
            <div className={`px-2 py-1 ${trade.isBid ? "text-green-400" : "text-red-400"}`}>{adjustDecimalLength(trade.price, 6)}</div>
            <div className="px-2 py-1 text-[color:var(--m-text-primary)]">
              {adjustDecimalLength(trade?.baseAmount, 6)}
            </div>
            <div className="relative px-2 py-1 text-center text-[color:var(--m-text-primary)]">
              {adjustDecimalLength(trade?.quoteAmount, 6)}
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
