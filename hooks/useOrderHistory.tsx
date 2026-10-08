import { applyFrame } from "@/lib/realtime/applyFrame";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SpotDeleteOrderItemEvent,
  SpotOrderHistory,
  SpotOrderHistoryEvent,
  SpotTrade,
  streamToEvent,
} from "@/types";
import { formatPrice } from "@/lib/format/price";
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
import { claimOutcome, playSound } from "@/lib/sound";

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
  "assetDecimals" | "gasUsed" | "status" | "orderId"
> & {
  /** The order's own id; null on a crossed row, which never rested. */
  orderId: number | null;
  /** false: the order crossed outright and has no id. Absent from gateways
   *  older than the field — read it through `neverRested`. */
  rested?: boolean;
  assetDecimals?: number;
  gasUsed?: number;
  status?: string;
  /** Fills against this order; each carries its counterparty (`origin`). */
  matchHistories?: (SpotTrade & { origin?: "pool" | "maker" })[];
  amountBN?: string | null;
  fills?: number;
  /** A crossed order's fills by counterparty; `pool + maker === fills`. */
  origins?: { pool: number; maker: number };
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
          // Whether the order rested; absent from an older gateway. Carried so
          // neverRested reads the field rather than inferring from orderId.
          rested: order.rested,
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
          // Passed through for the History tab: what became of the order, its
          // exact size (a full cancel zeroes `amount` but not `amountBN`), and
          // for an order that crossed outright, how many fills it took.
          status: (order as { status?: string }).status,
          amountBN: (order as { amountBN?: string | null }).amountBN ?? null,
          assetDecimals: (order as { assetDecimals?: number }).assetDecimals,
          fills: (order as { fills?: number }).fills,
          origins: (order as { origins?: { pool: number; maker: number } }).origins,
        };
      });
      setPrevOrderHistories(orderHistoryEvents);
      // not-a-frame: inside this query's own queryFn, writing its own result.
      queryClient.setQueryData(queryKey, orderHistoryEvents);
      return orderHistoryEvents;
    },
    staleTime: Infinity,
  });

  // get event from eventBus
  useEffect(() => {
    const handleOrderHistoryUpdate = (orderHistoryEvent: SpotOrderHistoryEvent) => {
      console.log("orderHistoryEvent", orderHistoryEvent);
      // "orderhistories", the key the query reads. This wrote to "orderhistory",
      // which nothing reads, so a new order never reached History live.
      const updateQueryKey = [
        "orderhistories",
        networkName,
        address,
        pageLimit,
        page,
      ];
      void applyFrame(queryClient, 
        updateQueryKey,
        (prev: SpotOrderHistoryEvent[]) => {
          if (!prev) return prev;
          // preserve previous state
          setPrevOrderHistories(prev);
          let orderUpdated = false;
          // update SpotOrderEvent to SpotOrder
          // (pair, side, orderId): an orderId is only unique within one book side.
          const updatedOrders = prev.map((order) => {
            if (
              order.orderId === orderHistoryEvent.orderId &&
              order.pair === orderHistoryEvent.pair &&
              order.isBid === orderHistoryEvent.isBid
            ) {
              orderUpdated = true;
              return orderHistoryEvent;
            }
            return order;
          });
          // if no update, add the order to the start if the page is 1
          if (!orderUpdated && page === 1) {
            updatedOrders.unshift(orderHistoryEvent);
            // Trim only a FULL page. This popped unconditionally, so on a page with
            // room — every new account's first order — the row it had just added
            // was the one removed, and History stayed empty until a reload.
            if (updatedOrders.length > pageLimit) updatedOrders.length = pageLimit;
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
      void applyFrame(queryClient, queryKey, (prev: SpotOrderHistoryEvent[]) => {
        setPrevOrderHistories(prev);
        closedPrice = prev.find(
          (order) => order.orderId === orderHistoryEvent.orderId
        )?.price;
        // HISTORY keeps the row: the order did not vanish, it finished. It used
        // to be filtered out, so a cancel or a fill removed the one record of it
        // until a reload. Status is updated in place instead.
        return prev.map((order) =>
          order.orderId === orderHistoryEvent.orderId && order.pair === orderHistoryEvent.pair
            ? { ...order, status: orderHistoryEvent.status }
            : order
        );
      });
      setUpdated(true);
      // A filled row's expand lists its fills from `matchHistories`, which only
      // the REST row carries — the closure frame has nine fields and no fills. So
      // a fill refetches the page: the broker commits before it publishes, and
      // the read that follows includes the trades this frame announced.
      if (orderHistoryEvent.status === "filled") {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }

      const closed = closesRef.current!.add({
        txHash: orderHistoryEvent.txHash,
        pair: orderHistoryEvent.pair,
        status: orderHistoryEvent.status === "filled" ? "filled" : "canceled",
        isBid: orderHistoryEvent.isBid,
        price: closedPrice,
      });
      const { title, description } = describeOrderClose(closed, (value) =>
        formatPrice(value)
      );

      // A fill is the signature cue — the order you left on the book met your
      // rate — and one per transaction, however many orders it closed. A cancel
      // was already sounded by the press that caused it, so its toast is quiet.
      if (closed.status === "filled") playSound("rateHit", { key: `close:${closed.key}` });
      else claimOutcome();
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
    // The key's parts, not `queryKey`: that array is rebuilt every render, so
    // depending on it recomputed this on every render.
  }, [queryData, prevOrderHistories, updated, queryClient, networkName, address, pageLimit, page]);

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
