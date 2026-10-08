"use client";
import { chainKeyForUrl, noteFrameWatermark } from "@/lib/realtime/watermark";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Row } from "@tanstack/react-table";
import { PonderWssLinks } from "@/consts";
import { SpotOrder, SpotOrderEvent, SpotOrderHistoryEvent, SpotToken, SpotTradeEvent, type SpotOrderCloseSummaryEvent, expandOrderCloseSummary, streamToEvent } from "@/types";
import { exchangeAbi } from "@/components/abis/exchange";
import { useMarketPageContext } from "./MarketPageProvider";
import { eventBus } from "@/utils/events";
import { createFrameBuffer } from "@/lib/realtime/frameBuffer";
import { onReturnFromAway, resyncAccountQueries } from "@/lib/realtime/accountResync";
import { useQueryClient } from "@tanstack/react-query";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import type { OrderHistoryRow } from "@/hooks/useOrderHistory";
import { useOrderHistory } from "@/hooks/useOrderHistory";
import { useOrders } from "@/hooks/useOrders";

export interface TokenData {
  tokens: SpotToken[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
}

export interface ContractArgs {
  abi: any;
  address: `0x${string}` | undefined;
  functionName: string | undefined;
  chainId: number | undefined;
  args: any[];
  value?: bigint;
}

interface OrderContextType {
  orders: SpotOrderEvent[];
  ordersTotalCount: number;
  ordersTotalPages: number;
  isOrdersLoading: boolean;
  isOrdersError: boolean;
  // REST rows, not socket frames — see OrderHistoryRow for why the two differ.
  orderHistories: OrderHistoryRow[];
  orderHistoriesTotalCount: number;
  orderHistoriesTotalPages: number;
  isOrderHistoriesLoading: boolean;
  isOrderHistoriesError: boolean;
  tradeHistories: SpotTradeEvent[];
  tradeHistoriesTotalCount: number;
  tradeHistoriesTotalPages: number;
  isTradeHistoriesLoading: boolean;
  isTradeHistoriesError: boolean;
  ordersPage: number;
  setOrdersPage: (page: number) => void;
  orderHistoriesPage: number;
  setOrderHistoriesPage: (page: number) => void;
  tradeHistoriesPage: number;
  setTradeHistoriesPage: (page: number) => void;
}

const OrderContext = createContext<OrderContextType | null>(null);

export const OrderPageProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { address, displayNetworkName, connectedChainId, matchingEngine, connectedNetworkName } =
    useMarketPageContext();

  // declare account related hooks
  const [ordersPage, setOrdersPage] = useState(1);
  const [orderHistoriesPage, setOrderHistoriesPage] = useState(1);
  const [tradeHistoriesPage, setTradeHistoriesPage] = useState(1);
  const { data: orders, isLoading: isOrdersLoading, isError: isOrdersError, totalCount: ordersTotalCount, totalPages: ordersTotalPages } = useOrders(displayNetworkName, address, 10, ordersPage);
  const { data: orderHistories, isLoading: isOrderHistoriesLoading, isError: isOrderHistoriesError, totalCount: orderHistoriesTotalCount, totalPages: orderHistoriesTotalPages } = useOrderHistory(displayNetworkName, address, 10, orderHistoriesPage);
  const { data: tradeHistories, isLoading: isTradeHistoriesLoading, isError: isTradeHistoriesError, totalCount: tradeHistoriesTotalCount, totalPages: tradeHistoriesTotalPages } = useTradeHistory(displayNetworkName, address, 10, tradeHistoriesPage); 


  // set up shared socket for each account
  const socketRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const disposedRef = useRef(false);
  const addressRef = useRef(address);
  const networkRef = useRef(displayNetworkName);
  // The address the socket has already been open for once. A second `onopen` for
  // the same address is a REconnect, and whatever was sent while it was down is
  // gone -- see lib/realtime/accountResync.
  const openedForRef = useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  addressRef.current = address;
  networkRef.current = displayNetworkName;

  // Fans one batch of account-stream events out to the eventBus. Kept in a ref so
  // the buffer survives re-renders -- a per-render instance would drop whatever
  // was queued when the provider re-rendered mid-batch.
  const eventBufferRef = useRef(
    createFrameBuffer<ReturnType<typeof streamToEvent>>((events) => {
      for (const parsedEvent of events) {
        switch (parsedEvent?.eventId) {
          case "spotOrder":
            eventBus.emit("spot-order-update", parsedEvent);
            break;
          case "spotOrderMatched":
            eventBus.emit("spot-order-matched", parsedEvent);
            break;
          case "spotOrderHistory":
            eventBus.emit("spot-order-history-update", parsedEvent);
            break;
          case "deleteSpotOrder":
            eventBus.emit("spot-order-delete", parsedEvent);
            break;
          case "deleteSpotOrderHistory":
            eventBus.emit("spot-order-history-delete", parsedEvent);
            break;
          // One transaction's closures as one frame — a sweep that consumed
          // several of this account's orders, or a cancel-all. Sent INSTEAD of
          // the per-order frames, so it is expanded into exactly those: both
          // listeners (useOrders' removal, useOrderHistory's status and its
          // transaction-keyed toast) see the same events either way, which is
          // what keeps the envelope and the per-order path on one toast id.
          case "spotOrderCloseSummary":
            for (const closed of expandOrderCloseSummary(parsedEvent as SpotOrderCloseSummaryEvent)) {
              eventBus.emit("spot-order-history-delete", closed);
            }
            break;
          case "spotTrade":
            eventBus.emit("spot-trade-history-update", parsedEvent);
            break;
          // One transaction's fills as a single frame. The gateway sends this
          // INSTEAD of the per-fill spotTrade frames on this topic, so the handler
          // expands it rather than treating it as a summary to display.
          case "spotFillSummary":
            eventBus.emit("spot-fill-summary", parsedEvent);
            break;
          case "spotAccountActivity":
            eventBus.emit("spot-account-activity", parsedEvent);
            break;
          default:
            break;
        }
      }
    })
  );
  // Function to handle WebSocket connection
  const connectWebSocket = useRef((targetAddress: `0x${string}` | undefined) => {
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      isConnectingRef.current || targetAddress === undefined || disposedRef.current
    ) {
      return;
    }

    isConnectingRef.current = true;
    const socket = new WebSocket(PonderWssLinks[networkRef.current]);
    socketRef.current = socket;

    const cleanup = (close = true) => {
      isConnectingRef.current = false;
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (close) {
        socket.onmessage = null;
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };

    socket.onopen = () => {
      console.log("Spot Account WebSocket connected");
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      if (openedForRef.current === targetAddress) {
        resyncAccountQueries(queryClientRef.current, networkRef.current, targetAddress);
      }
      openedForRef.current = targetAddress;
      console.log(targetAddress, "address");
      socket.send(
        JSON.stringify({
          id: "1",
          method: "spot.accounts.subscribe.addresses",
          params: {
            addresses: [targetAddress],
          },
        })
      );
    };

    socket.onclose = () => {
      console.log("Spot Account WebSocket disconnected");
      if (socketRef.current !== socket) return;
      cleanup(false);
      if (disposedRef.current || addressRef.current !== targetAddress) return;
      const attempt = reconnectAttemptsRef.current;
      // No give-up: past the backoff it keeps trying every 30 s. Stopping left a
      // visible tab offline for good, with every later fill and closure lost.
      if (reconnectTimerRef.current) return;
      reconnectAttemptsRef.current = attempt + 1;
      const delay = Math.min(30_000, 1_000 * 2 ** attempt);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!disposedRef.current && addressRef.current === targetAddress) connectWebSocket(targetAddress);
      }, delay);
    };

    socket.onerror = (err) => {
      console.error("Spot Account WebSocket error", err);
      // The close event owns reconnect scheduling. Closing here can race onclose
      // and create duplicate timers/sockets.
    };

    socket.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        // A malformed frame must not take down the account stream handler.
        return;
      }

      // Handle server ping
      if (data.method === "ping") {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ method: "pong" }));
        }
        return;
      }

      if (data.result === null) {
        console.log(`Spot account for ${targetAddress} is subscribed`);
        return;
      }

      // Record the batch's commit watermark before anything reacts to it.
      noteFrameWatermark(chainKeyForUrl(PonderWssLinks[networkRef.current]), data?.w);

      // The gateway coalescer wraps frames in a WsBatch -- `{ t, ps, s, d }` where
      // `d` holds the frames -- and every topic goes through it, `spotAccount:*`
      // included. `streamToEvent` reads the event id at `stream[0]`, which on the
      // wrapper is undefined, so passing the raw message returned null and the
      // handler dropped it: EVERY account frame was discarded here. The orderbook
      // and recent-trades hooks unwrap correctly via lib/realtime/socket-manager;
      // this connection predates it.
      //
      // Both shapes are accepted because a gateway deployed before the coalescer
      // publishes bare tuples, and the two must not need a coordinated deploy.
      const frames: unknown[] = Array.isArray(data)
        ? [data]
        : Array.isArray(data.d)
          ? data.d
          : [];

      for (const frame of frames) {
        const parsedEvent = streamToEvent(frame as never);
        // An unrecognized eventId decodes to null. That is the forward-compatible
        // path, not an error: a newer gateway can add a frame type and this client
        // ignores it instead of breaking.
        if (!parsedEvent) continue;

        // Buffered rather than emitted inline. Socket messages arrive one per task
        // tick, so each used to get its own React render -- and each handler
        // downstream rebuilds a whole page of rows with setQueryData plus four
        // setState calls. A market order sweeping the book emits one frame per
        // consumed level (up to the engine's `maxMatches`, 20 by default and
        // uncapped by the setter), which meant twenty renders of the orders table
        // for one transaction. Flushing the batch inside a single callback lets
        // React's automatic batching collapse them into one render, without
        // changing the eventBus contract the six handlers depend on.
        //
        // Note the per-event console.log that used to sit here is gone: it ran
        // unconditionally on every frame and retained a reference to every event
        // object for the lifetime of the console.
        eventBufferRef.current.push(parsedEvent);
      }
    };
  }).current;

  // Only connect if we don't have a connection && address is defined from market page provider
  useEffect(() => {
    disposedRef.current = false;
    if (!socketRef.current && address) {
      connectWebSocket(address);
    }
    // Back from a hidden tab or an offline spell: the socket may have died
    // without anyone noticing (or be waiting out a 30 s backoff), and frames
    // were certainly not delivered to a suspended tab. Reconnect now if needed
    // and re-read what the frames would have changed.
    const stopWatching = onReturnFromAway(() => {
      if (!address || disposedRef.current) return;
      reconnectAttemptsRef.current = 0;
      if (!socketRef.current) connectWebSocket(address);
      resyncAccountQueries(queryClientRef.current, displayNetworkName, address);
    });
    return () => {
      stopWatching();
      openedForRef.current = undefined;
      disposedRef.current = true;
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = socketRef.current;
      if (socket) {
        socket.onmessage = null;
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        socketRef.current = null;
      }
      isConnectingRef.current = false;
      eventBufferRef.current.cancel();
    };
  }, [address, displayNetworkName]);

  
  const getContractDataFromOrders = (
    rows: Row<SpotOrder>[]
  ): [string[], string[], boolean[], bigint[]] => {
    const base: string[] = [];
    const quote: string[] = [];
    const isBid: boolean[] = [];
    const orderIds: bigint[] = [];

    rows.forEach((row) => {
      base.push(row.original.base.id);
      quote.push(row.original.quote.id);
      isBid.push(row.original.isBid);
      orderIds.push(BigInt(row.original.orderId));
    });
    return [base, quote, isBid, orderIds];
  };

  // get states for canceling orders
  const cancelOrderContractArgs = useMemo(() => {
    return {
      address: matchingEngine,
      abi: exchangeAbi,
      chainId: connectedChainId,
      functionName: "cancelOrders",
      args: getContractDataFromOrders([]),
    };
  }, []);

  return (
    <>
      <OrderContext.Provider value={{
        orders,
        ordersTotalCount,
        ordersTotalPages,
        isOrdersLoading,
        isOrdersError,
        orderHistories,
        orderHistoriesTotalCount,
        orderHistoriesTotalPages,
        isOrderHistoriesLoading,
        isOrderHistoriesError,
        tradeHistories,
        tradeHistoriesTotalCount,
        tradeHistoriesTotalPages,
        isTradeHistoriesLoading,
        isTradeHistoriesError,
        ordersPage,
        setOrdersPage,
        orderHistoriesPage,
        setOrderHistoriesPage,
        tradeHistoriesPage,
        setTradeHistoriesPage,
      }}>{children}</OrderContext.Provider>
    </>
  );
};

export const useOrderPageContext = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error(
      "useTradePageContext must be used within a TradePageProvider"
    );
  }
  return context;
};
