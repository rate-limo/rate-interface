import { useEffect, useMemo, useRef, useState } from "react";
import {
  SpotDeleteOrderItemEvent,
  SpotOrderHistory,
  SpotOrderHistoryEvent,
  SpotTrade,
  streamToEvent,
} from "@/types";
import { adjustDecimalLength } from "@/utils/number";
import {
  createOrderCloseAggregator,
  describeOrderClose,
  type OrderCloseAggregator,
} from "@/lib/toast/orderCloseAggregator";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { getSpotAccountOrderHistories } from "@/queries/server/orderhistories";
import { toast } from "sonner";

/**
 * What the REST order-history route actually returns.
 *
 * NOT a `SpotOrderHistoryEvent`: that is the socket's wire shape, and it carries three
 * fields REST does not (`assetDecimals`, `gasUsed`, `status`) while lacking one REST does
 * (`matchHistories`). Typing these rows as the wire event is how a REST-only field ended
 * up looking like part of the protocol — and how the two drifted apart unnoticed.
 */
export type OrderHistoryRow = Omit<
  SpotOrderHistoryEvent,
  "assetDecimals" | "gasUsed" | "status"
> & {
  assetDecimals?: number;
  gasUsed?: number;
  status?: string;
  matchHistories?: SpotTrade[];
};

export const useOrderHistory = (
  networkName: string,
  address: string | undefined,
  pageLimit: number,
  page: number
) => {
  const queryKey = ["orderhistories", networkName, address, pageLimit, page];
  const queryClient = useQueryClient();
  const [updated, setUpdated] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [prevOrderHistories, setPrevOrderHistories] = useState<
    OrderHistoryRow[]
  >([]);
  // One aggregator per hook instance, kept across renders -- a per-render instance
  // would restart the count on every closure and defeat the coalescing. Lazy so
  // the Map is not allocated and thrown away on every render.
  const closesRef = useRef<OrderCloseAggregator | null>(null);
  closesRef.current ??= createOrderCloseAggregator();

  const {
    data: queryData,
    status,
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: queryKey,
    queryFn: async () => {
      console.log("Fetching order histories for:", { networkName, address, pageLimit, page });
      const data = await getSpotAccountOrderHistories(
        networkName,
        address as string,
        pageLimit,
        page
      );
      
      if (data.noAddress) {
        console.log("No address provided");
        setTotalCount(0);
        setTotalPages(0);
        return [];
      }
      
      setTotalCount(data.totalCount);
      setTotalPages(data.totalPages);
      const orderHistoryEvents: OrderHistoryRow[] = data.orderHistories.map((order: SpotOrderHistory) => {
        return {
          eventId: "spotOrderHistory",
          isBid: order.isBid,
          orderId: order.orderId,
          base: order.base.id,
          baseSymbol: order.baseSymbol,
          quote: order.quote.id,
          quoteSymbol: order.quoteSymbol,
          pairSymbol: order.pairSymbol,
          pair: order.pair,
          price: order.price,
          asset: order.asset.id,
          assetSymbol: order.assetSymbol,
          amount: order.amount,
          timestamp: order.timestamp,
          account: order.account,
          txHash: order.txHash,
          updatedAt: Date.now(),
          matchHistories: order.matchHistories,
        };
      });
      setPrevOrderHistories(orderHistoryEvents);
      queryClient.setQueryData(queryKey, orderHistoryEvents);
      return orderHistoryEvents;
    },
    staleTime: Infinity,
  });

  // get event from eventBus
  useEffect(() => {
    const handleOrderHistoryUpdate = (orderHistoryEvent: SpotOrderHistoryEvent) => {
      console.log("orderHistoryEvent", orderHistoryEvent);
      const updateQueryKey = [
        "orderhistory",
        networkName,
        address,
        pageLimit,
        page,
      ];
      queryClient.setQueryData(
        updateQueryKey,
        (prev: SpotOrderHistoryEvent[]) => {
          if (!prev) return prev;
          // preserve previous state
          setPrevOrderHistories(prev);
          let orderUpdated = false;
          // update SpotOrderEvent to SpotOrder
          const updatedOrders = prev.map((order) => {
            if (order.orderId === orderHistoryEvent.orderId) {
              orderUpdated = true;
              return orderHistoryEvent;
            }
            return order;
          });
          // if no update, add the order to the start if the page is 1
          if (!orderUpdated && page === 1) {
            updatedOrders.unshift(orderHistoryEvent);
            // remove the last order if the page is 1
            updatedOrders.pop();
          }
          setTotalCount(prev.length + 1);
          setTotalPages(Math.ceil((prev.length + 1) / pageLimit));
          return updatedOrders;
        }
      );
      setUpdated(true);
    };

    // Two different outcomes arrive on this one event, and the payload says which.
    //
    // The broker emits `deleteSpotOrderHistory` from BOTH branches of
    // OrderMatched/AccountOrder: `status: "canceled"` when the order was pulled,
    // and `status: "filled"` when a match cleared it. The word "cancelled" used to
    // be hardcoded here and the field never read -- so a maker whose order filled
    // completely got exactly one notification of the trade, and it told them the
    // order was cancelled. A full fill is the outcome a maker most wants to hear
    // about and it was the one case with no correct toast anywhere.
    //
    // Branch on "filled" positively (note the payload's single-l "canceled" against
    // the double-l display copy) so an unexpected status reads as a cancellation
    // rather than claiming a fill that may not have happened.
    //
    // Coalesced by transaction, not by order id -- one sweep can clear several of
    // one maker's resting orders, and `cancelOrders` takes an array, so both
    // outcomes arrive in bursts. Keyed on the order id (as it was) every closure
    // raised its own toast; keyed on the transaction they update ONE toast in
    // place. See lib/toast/orderCloseAggregator for why this counts orders and
    // reports a price range rather than averaging as the fill aggregator does.
    const handleOrderHistoryDelete = (orderHistoryEvent: SpotDeleteOrderItemEvent) => {
      console.log("delete orderHistoryEvent", orderHistoryEvent);
      // The delete payload carries no price -- it is a `SpotDeleteOrderItemEvent`,
      // nine fields, not the full history row. The price comes off the row being
      // removed, which is still in the cache at this point.
      let closedPrice: number | undefined;
      queryClient.setQueryData(queryKey, (prev: SpotOrderHistoryEvent[]) => {
        setPrevOrderHistories(prev);
        setTotalCount(prev.length - 1);
        setTotalPages(Math.ceil((prev.length - 1) / pageLimit));
        closedPrice = prev.find(
          (order) => order.orderId === orderHistoryEvent.orderId
        )?.price;
        return prev.filter(
          (order) => order.orderId !== orderHistoryEvent.orderId
        );
      });
      setUpdated(true);

      const closed = closesRef.current!.add({
        txHash: orderHistoryEvent.txHash,
        pair: orderHistoryEvent.pair,
        status: orderHistoryEvent.status === "filled" ? "filled" : "canceled",
        isBid: orderHistoryEvent.isBid,
        price: closedPrice,
      });
      const { title, description } = describeOrderClose(closed, (value) =>
        adjustDecimalLength(value, 4)
      );

      toast.success(title, {
        description,
        duration: 4000,
        id: `order-close-${closed.key}`,
      });
    };

    eventBus.on("spot-order-history-update", handleOrderHistoryUpdate);
    eventBus.on("spot-order-history-delete", handleOrderHistoryDelete);

    return () => {
      eventBus.off("spot-order-history-update", handleOrderHistoryUpdate);
      eventBus.off("spot-order-history-delete", handleOrderHistoryDelete);
    };
  }, [networkName, address, pageLimit, page]);

  const memoizedOrderHistories = useMemo(() => {
    if (queryData && address) {
      if (updated) {
        setUpdated(false);
      }
      const updateQueryKey =  ["orderhistories", networkName, address, pageLimit, page];
      const cachedData = queryClient.getQueryData(updateQueryKey) as SpotOrderHistoryEvent[];
      return cachedData || queryData;
    }
    return prevOrderHistories;
  }, [queryData, prevOrderHistories, updated, queryClient, queryKey]);

  return {
    data: memoizedOrderHistories,
    totalCount,
    totalPages,
    status,
    isLoading,
    error,
    isError,
  };
};
