import { useEffect, useMemo, useRef, useState } from "react";
import { SpotOrder, SpotOrderEvent, SpotOrderMatchedEvent } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { getSpotAccountOrders } from "@/queries/server/orders";
import { toast } from "sonner";
import defaultTokenList from "@iter/token-list";
import { adjustDecimalLength } from "@/utils/number";
import {
  createFillAggregator,
  describeFill,
  type FillAggregator,
} from "@/lib/toast/fillAggregator";

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
    queryFn: async () => {
      const data = await getSpotAccountOrders(
        networkName,
        address,
        pageLimit,
        page
      );

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
      queryClient.setQueryData(queryKey, orderEvents);
      console.log("queryKey in useQuery", queryKey);
      return orderEvents;
    },
    staleTime: Infinity,
  });

  // make sure address is defined to keep the same queryKey
  useEffect(() => {
    if (!address) return;
    const currentQueryKey = ["orders", networkName, address, pageLimit, page]; // Capture the queryKey in closure
    console.log("currentQueryKey in event handler", currentQueryKey);

    const handleOrderMatched = (orderMatchedEvent: SpotOrderMatchedEvent) => {
      console.log("orderMatchedEvent", orderMatchedEvent);

      const updatedOrder: SpotOrderEvent = {
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
        updatedAt: orderMatchedEvent.updatedAt
      };
      queryClient.setQueryData(currentQueryKey, (prev: SpotOrderEvent[]) => {
        if (!prev) return prev;
        setPrevOrders(prev);

        // Identity is (pair, side, orderId), matching the broker's own row key —
        // orderId alone is only unique WITHIN a pair and side, and this list holds one
        // account's orders across every pair, so matching on it alone would overwrite an
        // unrelated market's row with this one's symbols and price.
        const updatedOrders = prev.map((order) =>
          order.orderId === orderMatchedEvent.orderId &&
          order.pair === orderMatchedEvent.pair &&
          order.isBid === orderMatchedEvent.isBid &&
          order.updatedAt !== orderMatchedEvent.updatedAt
            ? updatedOrder
            : order,
        );
        // No unshift-and-pop, and no count bump: a match never CREATES an order, it
        // shrinks one that already exists. This handler was copied from the spotOrder
        // one, where prepending a new row is right — here it invented a phantom order
        // and dropped a real one off the end whenever the filled order was not on the
        // current page. (Dead code until the spotOrderMatched wire gap was closed, so
        // this never actually ran.)
        return updatedOrders;
      });
      setUpdated(true);

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
      const fill = fillsRef.current!.add({
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
      const { title, description } = describeFill(fill, (value) =>
        adjustDecimalLength(value, 4)
      );

      toast.success(
        <div className="flex items-center gap-2">
          <img
            alt=""
            src={orderMatchedEvent.baseLogoURI}
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

    const handleOrderUpdate = (orderEvent: SpotOrderEvent) => {
      console.log("orderEvent", orderEvent);
      queryClient.setQueryData(currentQueryKey, (prev: SpotOrderEvent[]) => {
        console.log("updatedOrders prev", prev, prevOrders);
        if (!prev) return prev;
        setPrevOrders(prev);

        let orderUpdated = false;
        const updatedOrders = prev.map((order) => {
          if (order.orderId === orderEvent.orderId) {
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

      toast.success(
        <div>
          <strong style={{ color: orderEvent.isBid ? "#4CAF50" : "#FF0000" }}>
            {orderEvent.isBid ? "Buy" : "Sell"}
          </strong>{" "}
          order placed at{" "}
          <span>{adjustDecimalLength(orderEvent.price, 4)}</span>
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

    const handleOrderDelete = (orderEvent: SpotOrderEvent) => {
      console.log("delete orderEvent", orderEvent);
      queryClient.setQueryData(currentQueryKey, (prev: SpotOrderEvent[]) => {
        setPrevOrders(prev);
        setTotalCount(prev.length - 1);
        setTotalPages(Math.ceil((prev.length - 1) / pageLimit));
        return prev.filter((order) => order.orderId !== orderEvent.orderId);
      });
    };

    eventBus.on("spot-order-matched", handleOrderMatched);
    eventBus.on("spot-order-update", handleOrderUpdate);
    eventBus.on("spot-order-delete", handleOrderDelete);

    return () => {
      eventBus.off("spot-order-matched", handleOrderMatched);
      eventBus.off("spot-order-update", handleOrderUpdate);
      eventBus.off("spot-order-delete", handleOrderDelete);
    };
  }, [networkName, address, pageLimit, page]);

  const memoizedOrders = useMemo(() => {
    if (queryData && address) {
      if (updated) {
        setUpdated(false);
      }
      return queryClient.getQueryData(queryKey) as SpotOrderEvent[];
    }
    return prevOrders;
  }, [queryData, prevOrders, updated, queryClient, queryKey]);

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
