import { applyFrame } from "@/lib/realtime/applyFrame";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SpotDeleteOrderItemEvent,
  SpotOrder,
  SpotOrderEvent,
  SpotOrderMatchedEvent,
} from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { getSpotAccountOrders } from "@/queries/server/orders";
import { toast } from "sonner";
import { playSound } from "@/lib/sound";
import defaultTokenList from "@iter/token-list";
import { formatPrice } from "@/lib/format/price";
import {
  createFillAggregator,
  describeFill,
  filledFraction,
  type FillAggregate,
  type FillAggregator,
} from "@/lib/toast/fillAggregator";

/** An order's identity is (pair, side, orderId) — the broker's own row key. */
function sameOrder(
  a: Pick<SpotOrderEvent, "pair" | "isBid" | "orderId">,
  b: Pick<SpotOrderEvent, "pair" | "isBid" | "orderId">,
): boolean {
  return a.orderId === b.orderId && a.isBid === b.isBid && a.pair.toLowerCase() === b.pair.toLowerCase();
}

export const useOrders = (
  networkName: string,
  address: string | undefined,
  pageLimit: number,
  page: number
) => {
  const queryKey = ["orders", networkName, address, pageLimit, page];
  const queryClient = useQueryClient();
  const [updated, setUpdated] = useState(false);
  const [prevOrders, setPrevOrders] = useState<SpotOrderEvent[]>([]);
  // Survives re-renders so fills from one transaction keep folding into one
  // aggregate; a per-render instance would restart the count on every fill.
  const fillsRef = useRef<FillAggregator | null>(null);
  fillsRef.current ??= createFillAggregator();
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [updateOrderIds, setUpdateOrderIds] = useState<number[]>([]);
  const [cancelOrderIds, setCancelOrderIds] = useState<number[]>([]);
  const scannerLink =
    defaultTokenList.scannerLink[
      networkName as keyof typeof defaultTokenList.scannerLink
    ];

  const {
    data: queryData,
    status,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKey,
    queryFn: async ({ signal }) => {
      const data = await getSpotAccountOrders(
        networkName,
        address,
        pageLimit,
        page
      );
      // Cancelled by a frame while the server action ran (applyFrame): its result
      // is discarded, so its counts must not land either.
      if (signal.aborted) throw new DOMException("superseded by a live update", "AbortError");

      if (data.noAddress) {
        return [];
      }
      setTotalCount(data.totalCount);
      setTotalPages(data.totalPages);
      const orderEvents: SpotOrderEvent[] = data.orders.map(
        (order: SpotOrder) => {
          return {
            eventId: "spotOrder",
            isBid: order.isBid,
            orderId: order.orderId,
            base: order.base.id,
            baseSymbol: order.baseSymbol,
            quote: order.quote.id,
            quoteSymbol: order.quoteSymbol,
            pairSymbol: order.pairSymbol,
            baseLogoURI: order.baseLogoURI,
            quoteLogoURI: order.quoteLogoURI,
            pair: order.pair,
            price: order.price,
            asset: order.asset.id,
            assetSymbol: order.assetSymbol,
            assetDecimals: order.asset.decimals,
            amount: order.amount,
            placed: order.placed,
            // Present on the row once migration 0031 has run; null on older orders.
            // `fillProgress` prefers them and falls back to the floats above.
            amountBN: (order as { amountBN?: string | null }).amountBN ?? null,
            placedBN: (order as { placedBN?: string | null }).placedBN ?? null,
            timestamp: order.timestamp,
            account: order.account,
            txHash: order.txHash,
            updatedAt: Date.now()
          };
        }
      );
      setPrevOrders(orderEvents);
      // Returned, never also written with setQueryData. A frame that lands while
      // this read is in flight makes applyFrame cancel it, and react-query then
      // discards what a cancelled queryFn returns -- but not what it already
      // wrote. The server action cannot be aborted, so a write here landed the
      // pre-frame rows after the frame and brought back an order the frame had
      // just removed, for good: staleTime is Infinity.
      return orderEvents;
    },
    staleTime: Infinity,
  });

  // make sure address is defined to keep the same queryKey
  useEffect(() => {
    if (!address) return;
    const currentQueryKey = ["orders", networkName, address, pageLimit, page]; // Capture the queryKey in closure
    console.log("currentQueryKey in event handler", currentQueryKey);

    const toOrderEvent = (orderMatchedEvent: SpotOrderMatchedEvent): SpotOrderEvent => ({
      eventId: "spotOrder",
      // Carried through from the matched event rather than defaulted: this is the
      // number an amount is divided by, so guessing it would misprice the row.
      assetDecimals: orderMatchedEvent.assetDecimals,
      isBid: orderMatchedEvent.isBid,
      orderId: orderMatchedEvent.orderId,
      base: orderMatchedEvent.base,
      baseSymbol: orderMatchedEvent.baseSymbol,
      baseLogoURI: orderMatchedEvent.baseLogoURI,
      quote: orderMatchedEvent.quote,
      quoteSymbol: orderMatchedEvent.quoteSymbol,
      pairSymbol: orderMatchedEvent.pairSymbol,
      quoteLogoURI: orderMatchedEvent.quoteLogoURI,
      pair: orderMatchedEvent.pair,
      price: orderMatchedEvent.price,
      asset: orderMatchedEvent.asset,
      assetSymbol: orderMatchedEvent.assetSymbol,
      amount: orderMatchedEvent.amount,
      placed: orderMatchedEvent.placed,
      amountBN: orderMatchedEvent.amountBN,
      placedBN: orderMatchedEvent.placedBN,
      timestamp: orderMatchedEvent.timestamp,
      account: orderMatchedEvent.account,
      txHash: orderMatchedEvent.txHash,
      updatedAt: orderMatchedEvent.updatedAt,
    });

    const applyMatches = (matches: SpotOrderMatchedEvent[]) => {
      void applyFrame(queryClient, currentQueryKey, (prev: SpotOrderEvent[]) => {
        if (!prev) return prev;
        setPrevOrders(prev);

        // Identity is (pair, side, orderId), matching the broker's own row key —
        // orderId alone is only unique WITHIN a pair and side, and this list holds one
        // account's orders across every pair, so matching on it alone would overwrite an
        // unrelated market's row with this one's symbols and price.
        //
        // No unshift-and-pop, and no count bump: a match never CREATES an order, it
        // shrinks one that already exists. This handler was copied from the spotOrder
        // one, where prepending a new row is right — here it invented a phantom order
        // and dropped a real one off the end whenever the filled order was not on the
        // current page. Applied in arrival order, so an order shrunk twice in one
        // transaction ends at its later size.
        let next = prev;
        for (const m of matches) {
          next = next.map((order) =>
            sameOrder(order, m) && order.updatedAt !== m.updatedAt ? toOrderEvent(m) : order,
          );
        }
        return next;
      });
      setUpdated(true);
    };

    // Coalesced by transaction, not by order id. One market order can consume up
    // to `maxMatches` resting orders (20 by default, uncapped by the setter), and
    // each consumed order used to raise its own toast because the id was keyed on
    // the maker's order id -- which differs per fill, so sonner's own id-dedup
    // never fired. Keyed on the transaction, those N fills update ONE toast in
    // place, and the aggregate is what keeps that toast truthful: without it the
    // survivor would report whichever fill happened to land last.
    //
    // `isBid` here is the RESTING order's side, and the existing wording treats a
    // resting ask as the maker "buying" quote -- preserved by resolving the side
    // at this boundary rather than inside the aggregator.
    const foldFill = (orderMatchedEvent: SpotOrderMatchedEvent): FillAggregate =>
      fillsRef.current!.add({
        txHash: orderMatchedEvent.txHash,
        pair: orderMatchedEvent.pair,
        side: orderMatchedEvent.isBid ? "sell" : "buy",
        matched: orderMatchedEvent.matched,
        price: orderMatchedEvent.price,
        symbol: !orderMatchedEvent.isBid
          ? orderMatchedEvent.quoteSymbol
          : orderMatchedEvent.baseSymbol,
        placed: orderMatchedEvent.placed,
        orderSize: orderMatchedEvent.amount,
      });

    const raiseFillToast = (fill: FillAggregate, baseLogoURI: string) => {
      const { title, description } = describeFill(fill, (value) =>
        formatPrice(value)
      );

      toast.success(
        <div className="flex items-center gap-2">
          <img
            alt=""
            src={baseLogoURI}
            loading="lazy"
            width="20"
            height="20"
            decoding="async"
            data-nimg="1"
          />
          <span>
            {title}
            {description ? (
              <span className="block text-xs opacity-60">{description}</span>
            ) : null}
          </span>
        </div>,
        {
          // No `position` override: every Toaster in the app is mounted
          // bottom-right, and the socket hooks used to override to top-right
          // per toast. Placing an order that immediately filled therefore put
          // the submit feedback and the fill feedback in opposite corners of
          // the screen at the same moment. One corner, one place to look.
          //
          // 1,000 ms was below the threshold at which a fill confirmation can
          // actually be read, and a coalesced toast carries more to read.
          duration: 4000,
          id: `fill-${fill.key}`,
        }
      );
    };

    const handleOrderMatched = (orderMatchedEvent: SpotOrderMatchedEvent) => {
      applyMatches([orderMatchedEvent]);
      const fill = foldFill(orderMatchedEvent);
      // Someone traded against your resting order. Once per transaction (the
      // aggregate's key), pitched up the more of the order is now filled.
      const pct = filledFraction(fill);
      playSound("fill", { key: `fill:${fill.key}`, pitch: 0.85 + (pct ?? 0) * 0.35 });
      raiseFillToast(fill, orderMatchedEvent.baseLogoURI);
    };

    const handleOrderUpdate = (orderEvent: SpotOrderEvent) => {
      console.log("orderEvent", orderEvent);
      void applyFrame(queryClient, currentQueryKey, (prev: SpotOrderEvent[]) => {
        console.log("updatedOrders prev", prev, prevOrders);
        if (!prev) return prev;
        setPrevOrders(prev);

        let orderUpdated = false;
        // (pair, side, orderId), as everywhere else in this file. Order ids
        // restart at 1 for every pair and side, so matching on the id alone made
        // a new order on one market overwrite an unrelated market's row.
        const updatedOrders = prev.map((order) => {
          if (sameOrder(order, orderEvent)) {
            orderUpdated = true;
            return orderEvent;
          }
          return order;
        });

        console.log("updatedOrders1", prev, updatedOrders);

        if (orderUpdated) {
          return updatedOrders;
        } else {
          if (page === 1 && prevOrders.length > pageLimit) {
            updatedOrders.unshift(orderEvent);
            updatedOrders.pop();
            return updatedOrders;
          }
          updatedOrders.unshift(orderEvent);
          setTotalCount(prev.length + 1);
          setTotalPages(Math.ceil((prev.length + 1) / pageLimit));
          console.log("updatedOrders2", updatedOrders);
          return updatedOrders;
        }
      });
      setUpdated(true);

      // The order now sits on the book at your price. Keyed by the order's
      // identity so a later update to the same row does not settle it again.
      playSound("rest", { key: `rest:${orderEvent.pair}:${orderEvent.isBid}:${orderEvent.orderId}` });
      toast.success(
        <div>
          <strong style={{ color: orderEvent.isBid ? "#4CAF50" : "#FF0000" }}>
            {orderEvent.isBid ? "Buy" : "Sell"}
          </strong>{" "}
          order placed at{" "}
          <span>{formatPrice(orderEvent.price)}</span>
          <br />
          <a
            href={`${scannerLink}/tx/${orderEvent.txHash}`}
            target="_blank"
            style={{
              color: orderEvent.isBid ? "#4CAF50" : "#FF0000",
              textDecoration: "underline",
            }}
            rel="noopener noreferrer"
          >
            View on Scanner
          </a>
        </div>,
        {
          // See the fill toast above: one corner for all trading feedback.
          duration: 3000,
          id: `order-${orderEvent.orderId}`,
        }
      );
    };

    // A cancel arrives as `deleteSpotOrder` AND `deleteSpotOrderHistory`; a match
    // that CLEARS an order arrives as `deleteSpotOrderHistory` (status "filled")
    // alone — OrderMatched/AccountOrder publishes no `deleteSpotOrder`. Listening
    // to the first only left a fully filled maker order on Open orders, at 0.00%
    // filled, until a reload. Both remove the row; the second is a no-op.
    const removeOrder = (closed: SpotDeleteOrderItemEvent) => {
      void applyFrame(queryClient, currentQueryKey, (prev: SpotOrderEvent[]) => {
        if (!prev) return prev;
        const next = prev.filter((order) => !sameOrder(order, closed));
        if (next.length === prev.length) return prev;
        setPrevOrders(prev);
        setTotalCount(prev.length - 1);
        setTotalPages(Math.ceil((prev.length - 1) / pageLimit));
        return next;
      });
    };

    eventBus.on("spot-order-matched", handleOrderMatched);
    eventBus.on("spot-order-update", handleOrderUpdate);
    eventBus.on("spot-order-delete", removeOrder);
    eventBus.on("spot-order-history-delete", removeOrder);

    return () => {
      eventBus.off("spot-order-matched", handleOrderMatched);
      eventBus.off("spot-order-update", handleOrderUpdate);
      eventBus.off("spot-order-delete", removeOrder);
      eventBus.off("spot-order-history-delete", removeOrder);
    };
  }, [networkName, address, pageLimit, page]);

  const memoizedOrders = useMemo(() => {
    if (queryData && address) {
      if (updated) {
        setUpdated(false);
      }
      return queryClient.getQueryData(["orders", networkName, address, pageLimit, page]) as SpotOrderEvent[];
    }
    return prevOrders;
    // The key's parts, not `queryKey`: that array is rebuilt every render, so
    // depending on it recomputed this on every render.
  }, [queryData, prevOrders, updated, queryClient, networkName, address, pageLimit, page]);

  // console.log(queryKey, memoizedOrders, "queryKey");

  return {
    data: memoizedOrders,
    updateOrderIds,
    setUpdateOrderIds,
    cancelOrderIds,
    setCancelOrderIds,
    totalCount,
    totalPages,
    status,
    isLoading,
    error,
    isError,
  };
};
