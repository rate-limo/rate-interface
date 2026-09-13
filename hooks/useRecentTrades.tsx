import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  SpotToken,
  SpotTrade,
  SpotTradeEvent,
  SpotFillSummaryEvent,
  collapseFillSummary,
  streamToEvent,
} from "@/types";
import { fetchRecentPairTradesPaginated } from "@/queries/server/trades";
import { getSocketManager } from "@/lib/realtime/socket-manager";
import { getWsUrl } from "@/lib/realtime/ws-url";
import { TradesStore } from "@/lib/realtime/trades-store";

/**
 * Recent trades over the shared websocket, kept in a fixed-size ring buffer
 * outside React (no unbounded arrays, no per-message renders).
 */
export const useRecentTrades = (
  networkName: string,
  base: SpotToken,
  quote: SpotToken,
) => {
  const pairSymbol = `${base.symbol}/${quote.symbol}`;
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [error, setError] = useState<Error | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => new TradesStore(), [networkName, pairSymbol]);

  useEffect(() => {
    let disposed = false;

    const load = () => {
      fetchRecentPairTradesPaginated(networkName, base.id, quote.id, 28, 1)
        .then((data) => {
          if (disposed) return;
          const trades = data.trades.map((trade: SpotTrade) => ({
            ...trade,
            base: trade.base.id,
            quote: trade.quote.id,
            asset: trade.asset.id,
          })) as SpotTradeEvent[];
          store.seed(trades);
          setStatus("success");
        })
        .catch((err) => {
          if (disposed) return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus("error");
        });
    };

    const manager = getSocketManager(getWsUrl(networkName));
    const unsubscribe = manager.subscribe(
      `spotTrade:${pairSymbol}`,
      {
        method: "spot.trades.subscribe.pairs",
        params: { pairs: [pairSymbol] },
        unsubscribeMethod: "spot.trades.unsubscribe.pairs",
      },
      {
        // An envelope becomes ONE row, not N. The initial load comes from
        // /api/trades/pair, which groups on the same key the envelope uses, so
        // expanding here would make the tape contradict the page it was loaded
        // onto: one row for a sweep on load, twenty appended when the next one
        // lands. `collapseFillSummary` mirrors the gateway's SQL aggregation
        // field for field so both paths describe a transaction identically.
        //
        // Both shapes stay accepted — a gateway older than the public-feed
        // envelope still sends one `spotTrade` per fill, so neither side needs
        // a coordinated deploy.
        onBatch: (batch) => {
          for (const frame of batch.d) {
            const event = streamToEvent(frame as never) as
              | SpotTradeEvent
              | SpotFillSummaryEvent
              | null;
            if (event?.eventId === "spotTrade") {
              store.add(event);
            } else if (event?.eventId === "spotFillSummary") {
              store.add(collapseFillSummary(event));
            }
          }
        },
        onResync: load,
      },
    );

    load();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [networkName, pairSymbol, base.id, quote.id, store]);

  const data = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return {
    data,
    status,
    isLoading: status === "pending",
    error,
  };
};
