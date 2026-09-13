import { SpotBarEvent, SpotPair } from "@/types";
import { eventBus } from "@/utils/events";
import Decimal from "decimal.js";
import { useEffect, useRef, useState } from "react";

interface PairData extends SpotPair {
  updatedAt: number;
}

export const usePair = (networkName: string, pair: SpotPair | null) => {
  const [data, setData] = useState<PairData | null>(pair ? { ...pair, updatedAt: Date.now() } : null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (pair && pair.symbol !== data?.symbol) {
      setData({ ...pair, updatedAt: Date.now() });
    }
  }, [pair]);

  useEffect(() => {
    const handleBarUpdate = (bar: SpotBarEvent) => {
      const pair = bar.id.split("-")[0];
      setData((old: PairData | null) => {
        if (old && old.ticker === pair && (bar.updatedAt !== old.updatedAt) ) {
          return {
            ...old,
            price: bar.price,
            dayQuoteVolumeUSD: bar.volume / 2 + old.dayQuoteVolumeUSD,
            dayPriceDifference: bar.price - old.dayOpen,
            dayPriceDifferencePercentage:
              ((bar.price - old.dayOpen) / old.dayOpen) * 100,
            dayHigh: Math.max(bar.price, old.dayHigh),
            dayLow: Math.min(bar.price, old.dayLow),
            updatedAt: bar.updatedAt,
          };
        }
        return old;
      });
      if (document.title.includes(pair)) {
        const formattedPrice = new Decimal(bar.price)
          .toFixed(4)
          .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        document.title = `${formattedPrice} | ${dataRef.current?.base.symbol}/${dataRef.current?.quote.symbol} | Iter ${networkName}`;
      }
    };

    eventBus.on("spot-bar-update", handleBarUpdate);

    return () => {
      eventBus.off("spot-bar-update", handleBarUpdate);
    };
  }, [networkName]);

  return {
    data: data as SpotPair,
  };
};
