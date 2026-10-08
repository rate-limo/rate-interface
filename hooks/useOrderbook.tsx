import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  GroupedOrderbookResult,
  SpotOrderBlockEvent,
  SpotPair,
  SpotToken,
  streamToEvent,
} from "@/types";
import { getSpotOrderbook } from "@/queries/server/orderbooks";
import { getSocketManager } from "@/lib/realtime/socket-manager";
import { getWsUrl } from "@/lib/realtime/ws-url";
import { OrderbookStore } from "@/lib/realtime/orderbook-store";

/**
 * Orderbook over the shared websocket. One socket for the whole app, deltas
 * are applied to a store outside React, and renders happen at the store's
 * flush tick (4/sec) instead of per message. On subscribe the gateway pushes
 * a snapshot; on any sequence gap or reconnect the book resyncs via REST.
 */
export const useOrderbook = (
  networkName: string,
  pair: SpotPair,
  base: SpotToken,
  quote: SpotToken,
  step: string,
  depth: number,
  isSingleSide: boolean,
  orderbookInput: GroupedOrderbookResult,
) => {
  const pairSymbol = `${base.symbol}/${quote.symbol}`;
  const [status, setStatus] = useState<"pending" | "success" | "error">("success");
  const [error, setError] = useState<Error | null>(null);

  const store = useMemo(
    () => new OrderbookStore(step, pairSymbol, orderbookInput),
    // A new store per pair/step; the input snapshot only seeds the first one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [networkName, pairSymbol, step],
  );

  const baseRef = useRef(base);
  const quoteRef = useRef(quote);
  baseRef.current = base;
  quoteRef.current = quote;

  useEffect(() => {
    let disposed = false;

    /**
     * Deltas that arrived while a snapshot was in flight.
     *
     * Applying them straight to the store is what this buffer exists to stop.
     * `socket-manager` reports a sequence gap and then hands over the gapped
     * batch anyway, so without this the store takes deltas on top of a book it
     * KNOWS is missing updates — and the result is a book that was never true at
     * any point in time, rather than one that is merely a moment old. On the Pro
     * terminal that is depth someone reads before sizing an order.
     *
     * Buffering rather than dropping, because `applySnapshot` replaces the book
     * wholesale: anything that landed after the server built the snapshot would
     * be lost, and a price level that then goes quiet stays wrong indefinitely.
     * Replay is safe because `OrderbookStore.applyDelta` is an absolute
     * set/delete per price level, never an increment — replaying one the
     * snapshot already contains writes the same value twice.
     *
     * Only the ORDERBOOK needs this, which is why it lives here and not in the
     * shared socket manager. Trades are append-only, so a gap there leaves the
     * list incomplete rather than wrong, and the refetch replaces it.
     */
    let pending: SpotOrderBlockEvent[] | null = null;
    // A cap, because a snapshot fetch that hangs must not grow this without
    // bound. Past it the OLDEST half is discarded rather than the newest: these
    // deltas are absolute set/delete per price level, so the most recent write
    // for a level is the only one that matters, and dropping the newest would
    // throw away exactly the updates worth keeping.
    const MAX_PENDING = 500;

    const resync = () => {
      setStatus("pending");
      pending = [];
      getSpotOrderbook(networkName, baseRef.current, quoteRef.current, step, depth, isSingleSide)
        .then((book) => {
          if (disposed) return;
          /*
           * A null book is a REFUSED read, not an empty one. `getSpotOrderbook`
           * returns null on a non-2xx or a network failure, and applying that as
           * a snapshot would clear the ladder the user is reading and then
           * replay the buffered deltas onto nothing. Take the error path, which
           * drops the buffer and lets the socket's own snapshot correct us.
           */
          if (!book) {
            pending = null;
            setError(new Error("orderbook snapshot unavailable"));
            setStatus("error");
            return;
          }
          store.applySnapshot(book);
          // Replay AFTER the snapshot, in arrival order, then stop buffering.
          const queued = pending ?? [];
          pending = null;
          for (const event of queued) store.applyDelta(event);
          setStatus("success");
        })
        .catch((err) => {
          if (disposed) return;
          // Drop the buffer on failure. Holding it would replay stale deltas
          // onto a book no snapshot ever corrected, and leaving it non-null
          // would silently swallow every delta from here on.
          pending = null;
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus("error");
        });
    };

    const manager = getSocketManager(getWsUrl(networkName));
    const unsubscribe = manager.subscribe(
      `spotOrderbook:${pairSymbol}:${step}`,
      {
        method: "spot.orderbooks.subscribe.pairs",
        params: { books: [{ pair: pairSymbol, step }] },
        unsubscribeMethod: "spot.orderbooks.unsubscribe.pairs",
      },
      {
        onSnapshot: (snapshot) => {
          store.applySnapshot(snapshot.d as GroupedOrderbookResult);
        },
        onBatch: (batch) => {
          for (const frame of batch.d) {
            const event = streamToEvent(frame as never) as SpotOrderBlockEvent | null;
            if (event?.eventId !== "spotOrderBlock") continue;
            if (pending) {
              // Snapshot in flight — hold rather than apply. See `pending`.
              pending.push(event);
              if (pending.length > MAX_PENDING) pending.splice(0, MAX_PENDING / 2);
            } else {
              store.applyDelta(event);
            }
          }
        },
        onResync: resync,
      },
    );

    // REST snapshot covers the initial mount and pair/step changes where the
    // server-rendered orderbookInput doesn't match.
    resync();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [networkName, pairSymbol, step, depth, isSingleSide, store]);

  const data = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return {
    data,
    status,
    isLoading: status === "pending",
    error,
  };
};
