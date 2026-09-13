import { useEffect, useMemo, useRef, useState } from "react";
import {
  SpotTrade,
  SpotTradeEvent,
  type SpotFillSummaryEvent,
  collapseFillSummary,
} from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { getSpotAccountTradeHistories } from "@/queries/server";
import { toast } from "sonner";
import { adjustDecimalLength } from "@/utils/number";
import {
  createFillAggregator,
  describeFill,
  type FillAggregator,
} from "@/lib/toast/fillAggregator";
import { tradeRowKey } from "@/lib/trades/identity";

export const useTradeHistory = (
  networkName: string,
  address: string | undefined,
  pageLimit: number,
  page: number
) => {
  const queryKey = ["tradehistory", networkName, address, pageLimit, page];
  const queryClient = useQueryClient();
  const [updated, setUpdated] = useState(false);
  const [prevTradeHistories, setPrevTradeHistories] = useState<
    SpotTradeEvent[]
  >([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  // See useOrders: one aggregator per hook instance, kept across renders.
  const fillsRef = useRef<FillAggregator | null>(null);
  fillsRef.current ??= createFillAggregator();

  const {
    data: queryData,
    status,
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: queryKey,
    queryFn: async () => {
      const data = await getSpotAccountTradeHistories(
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
      const tradeHistoryEvents: SpotTradeEvent[] = data.tradeHistories.map(
        (tradeHistory: SpotTrade) => {
          return {
            eventId: "spotTrade",
            orderId: tradeHistory.orderId,
            base: tradeHistory.base.id,
            quote: tradeHistory.quote.id,
            baseSymbol: tradeHistory.baseSymbol,
            quoteSymbol: tradeHistory.quoteSymbol,
            baseLogoURI: tradeHistory.base.logoURI,
            quoteLogoURI: tradeHistory.quote.logoURI,
            pair: tradeHistory.pair,
            pairSymbol: tradeHistory.pairSymbol,
            isBid: tradeHistory.isBid,
            price: tradeHistory.price,
            account: tradeHistory.account,
            asset: tradeHistory.asset.id,
            assetSymbol: tradeHistory.assetSymbol,
            amount: tradeHistory.amount,
            valueUSD: tradeHistory.valueUSD,
            baseAmount: tradeHistory.baseAmount,
            quoteAmount: tradeHistory.quoteAmount,
            baseFee: tradeHistory.baseFee ?? 0,
            quoteFee: tradeHistory.quoteFee ?? 0,
            timestamp: tradeHistory.timestamp,
            taker: tradeHistory.taker,
            maker: tradeHistory.maker,
            txHash: tradeHistory.txHash,
            updatedAt: Date.now()
          };
        }
      );
      setPrevTradeHistories(tradeHistoryEvents);
      queryClient.setQueryData(queryKey, tradeHistoryEvents);
      return tradeHistoryEvents;
    },
    staleTime: Infinity,
  });

  // get event from eventBus
  useEffect(() => {
    const handleTradeHistoryUpdate = (tradeHistoryEvent: SpotTradeEvent) => {
      console.log("tradeHistoryEvent", tradeHistoryEvent);
      const updateQueryKey = [
        "tradehistory",
        networkName,
        address,
        pageLimit,
        page,
      ];
      queryClient.setQueryData(updateQueryKey, (prev: SpotTradeEvent[]) => {
        if (!prev) return prev;
        // preserve previous state
        setPrevTradeHistories(prev);
        let tradeUpdated = false;
        // Matched on (txHash, pair, orderId), never orderId alone — see
        // lib/trades/identity. An orderId is an orderbook sequence number, and
        // this cache now holds rows where it is THIS wallet's own resting order;
        // keyed on it alone an unrelated taker fill silently overwrote one.
        const incoming = tradeRowKey(tradeHistoryEvent);
        const updatedTradeHistories = prev?.map((trade) => {
          if (tradeRowKey(trade) === incoming) {
            tradeUpdated = true;
            return tradeHistoryEvent;
          }
          return trade;
        });
        // if no update, add the order to the start if the page is 1
        if (!tradeUpdated && page === 1) {
          updatedTradeHistories.unshift(tradeHistoryEvent);
          // remove the last order if the page is 1
          updatedTradeHistories.pop();
        }
        setTotalCount(prev.length + 1);
        setTotalPages(Math.ceil((prev.length + 1) / pageLimit));
        return updatedTradeHistories;
      });
      setUpdated(true);
      // Same coalescing as useOrders, on the taker side: a market order sweeping N
      // levels produces N spotTrade frames, and the old id (`trade-history-` plus
      // the MAKER's order id) differed per fill, so every one stacked its own
      // toast. `isBid` here is the taker's own side, hence the opposite mapping to
      // useOrders -- which is why the aggregator takes a resolved side.
      const fill = fillsRef.current!.add({
        txHash: tradeHistoryEvent.txHash,
        pair: tradeHistoryEvent.pair,
        side: tradeHistoryEvent.isBid ? "buy" : "sell",
        matched: tradeHistoryEvent.amount,
        price: tradeHistoryEvent.price,
        symbol: tradeHistoryEvent.baseSymbol,
        // No `placed`: a taker has no resting order, so there is no remainder to
        // report. Omitted rather than zeroed -- zero means "fully filled" here.
      });
      const { title, description } = describeFill(fill, (value) =>
        adjustDecimalLength(value, 4)
      );

      toast.success(
        <div className="flex items-center gap-2">
          <img
            alt=""
            src={tradeHistoryEvent.baseLogoURI}
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
          // See useOrders: no per-toast position override, so submit feedback
          // and fill feedback share one corner instead of landing in two.
          duration: 4000,
          id: `fill-${fill.key}`,
        }
      );
    };

    // The envelope path: the gateway sends ONE frame per transaction carrying every
    // fill, instead of one frame per fill. Both paths exist on purpose — a gateway
    // deployed before the envelope still sends per-fill frames, and neither side
    // needs a coordinated deploy.
    //
    // The envelope becomes ONE row, because /api/tradehistory now groups on the
    // same key (gateway api/tradeGrouping.ts). Expanding it here would show a
    // sweep as one line on load and twenty when it arrives live — the same
    // transaction rendered two ways depending on how it reached the page.
    //
    // `collapseFillSummary` mirrors that SQL aggregation field for field: size-
    // weighted price, summed amounts and fees, min orderId, and a `fills` count
    // standing in for the per-match detail the fold gives up.
    const handleFillSummary = (summary: SpotFillSummaryEvent) => {
      const rows = [collapseFillSummary(summary)];
      if (summary.fills.length === 0) return;

      const updateQueryKey = ["tradehistory", networkName, address, pageLimit, page];
      queryClient.setQueryData(updateQueryKey, (prev: SpotTradeEvent[]) => {
        if (!prev) return prev;
        setPrevTradeHistories(prev);

        // Applied as one batch. Newest first, matching the per-fill path's unshift.
        // Same composite key as the per-fill path, for the same reason.
        const byKey = new Map(rows.map((r) => [tradeRowKey(r), r]));
        const merged = prev.map((t) => byKey.get(tradeRowKey(t)) ?? t);
        for (const row of rows) if (merged.some((t) => t === row)) byKey.delete(tradeRowKey(row));

        const fresh = rows.filter((r) => byKey.has(tradeRowKey(r)));
        if (page === 1 && fresh.length > 0) {
          merged.unshift(...[...fresh].reverse());
          merged.length = Math.min(merged.length, pageLimit);
        }
        setTotalCount(prev.length + fresh.length);
        setTotalPages(Math.ceil((prev.length + fresh.length) / pageLimit));
        return merged;
      });
      setUpdated(true);

      // No client-side fold needed: the gateway already weighted the average by
      // size. The toast id matches the per-fill path's so the two can never stack.
      const fmt = (value: number) => adjustDecimalLength(value, 4);
      toast.success(
        <div className="flex items-center gap-2">
          <img
            alt=""
            src={summary.baseLogoURI}
            loading="lazy"
            width="20"
            height="20"
            decoding="async"
            data-nimg="1"
          />
          <span>
            {`${summary.isBid ? "Bought" : "Sold"} ${fmt(summary.matched)} ${summary.baseSymbol} at ${
              summary.fills.length > 1 ? `avg ${fmt(summary.avgPrice)}` : fmt(summary.avgPrice)
            }`}
            {summary.fills.length > 1 ? (
              <span className="block text-xs opacity-60">{`${summary.fills.length} fills`}</span>
            ) : null}
          </span>
        </div>,
        {
          duration: 4000,
          id: `fill-${summary.txHash}:${summary.pair}:${summary.isBid ? "buy" : "sell"}`,
        }
      );
    };

    eventBus.on("spot-trade-history-update", handleTradeHistoryUpdate);
    eventBus.on("spot-fill-summary", handleFillSummary);

    return () => {
      eventBus.off("spot-trade-history-update", handleTradeHistoryUpdate);
      eventBus.off("spot-fill-summary", handleFillSummary);
    };
  }, [networkName, address, pageLimit, page]);

  const memoizedTradeHistories = useMemo(() => {
    if (queryData && address) {
      if (updated) {
        setUpdated(false);
      }
      const updateQueryKey = [
        "tradehistory",
        networkName,
        address,
        pageLimit,
        page,
      ];
      return queryClient.getQueryData(updateQueryKey) as SpotTradeEvent[];
    }
    return prevTradeHistories;
  }, [queryData, prevTradeHistories, updated, queryClient, queryKey]);

  return {
    data: memoizedTradeHistories,
    totalCount,
    totalPages,
    status,
    isLoading,
    error,
    isError,
  };
};
