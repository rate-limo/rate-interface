import { applyFrame } from "@/lib/realtime/applyFrame";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SpotTrade,
  SpotTradeEvent,
  type SpotFillSummaryEvent,
  collapseFillSummary,
  expandFillSummary,
} from "@/types";
import { makerOrderIdFromWire } from "@iter/types";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { getSpotAccountTradeHistories } from "@/queries/server";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format/price";
import {
  createFillAggregator,
  describeFill,
  type FillAggregator,
} from "@/lib/toast/fillAggregator";
import { makerOrderIdOf, tradeRowKey } from "@/lib/trades/identity";
import { wasTaker } from "@/lib/trades/perspective";

/**
 * A REST trade-history row: the wire event plus the grouped route's `origins`
 * — how many of the row's fills the pool filled and how many another trader
 * did. Live frames carry no counts, so a row replaced by one loses them until
 * the next fetch and the counterparty reads as unknown rather than guessed.
 */
export type TradeHistoryRow = SpotTradeEvent & {
  origins?: { pool: number; maker: number };
  /** How many fills the row stands for (1 = a single fill). */
  fills?: number;
  /** Who the viewer traded with — up to five trader addresses, the exact
   *  count, and the pool if it filled any of it. From the gateway on REST
   *  rows; attached from the envelope's fills on a live one. Read through
   *  lib/trades/counterparty, which falls back when they are absent. */
  counterparties?: string[];
  counterpartyCount?: number;
  poolAddress?: string | null;
  /** A band pool's fee on the row, in the token received, and whether it is an
   *  estimate. REST only: a live frame carries an exact one in baseFee/quoteFee. */
  poolFee?: number | null;
  poolFeeEstimated?: boolean | null;
};

/** Same cap as the gateway's `COUNTERPARTY_LIST_CAP`. */
const LIVE_COUNTERPARTY_CAP = 5;

/**
 * The collapsed envelope's counterparties, in the REST row's shape, so a live
 * row names who it traded with instead of a dash until the next refetch.
 *
 * Only the TAKER's envelope collapses (a maker's expands to single fills, whose
 * own `taker` is the counterparty). Each fill's maker is the other side; a fill
 * that consumed no resting order (`orderId` 0 on the wire) is the pool's, and
 * its maker is the pool address — the same split the gateway makes, so the live
 * row and the refetched one render the same way.
 */
export function liveCounterparties(
  summary: SpotFillSummaryEvent,
  viewer: string | undefined,
): Pick<TradeHistoryRow, "counterparties" | "counterpartyCount" | "poolAddress" | "origins"> {
  const traders = new Set<string>();
  let poolAddress: string | null = null;
  let pool = 0;
  for (const f of summary.fills) {
    const maker = f[8];
    if (makerOrderIdFromWire(f[0]) === null) {
      pool += 1;
      poolAddress ??= maker || null;
    } else if (maker && !(viewer && maker.toLowerCase() === viewer.toLowerCase())) {
      traders.add(maker);
    }
  }
  const list = [...traders];
  return {
    counterparties: list.slice(0, LIVE_COUNTERPARTY_CAP),
    counterpartyCount: list.length,
    poolAddress,
    origins: { pool, maker: summary.fills.length - pool },
  };
}

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
      const tradeHistoryEvents: TradeHistoryRow[] = data.tradeHistories.map(
        (tradeHistory: SpotTrade) => {
          return {
            eventId: "spotTrade",
            orderId: tradeHistory.orderId,
            // Explicit, so this row keys the same as the live frame for the
            // same fill whichever gateway answered — see lib/trades/identity.
            makerOrderId: makerOrderIdOf(tradeHistory),
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
            updatedAt: Date.now(),
            origins: (tradeHistory as { origins?: { pool: number; maker: number } }).origins,
            fills: (tradeHistory as { fills?: number }).fills,
            counterparties: (tradeHistory as { counterparties?: string[] }).counterparties,
            counterpartyCount: (tradeHistory as { counterpartyCount?: number }).counterpartyCount,
            poolAddress: (tradeHistory as { poolAddress?: string | null }).poolAddress,
            poolFee: (tradeHistory as { poolFee?: number | null }).poolFee ?? null,
            poolFeeEstimated: (tradeHistory as { poolFeeEstimated?: boolean | null }).poolFeeEstimated ?? null,
          };
        }
      );
      setPrevTradeHistories(tradeHistoryEvents);
      // not-a-frame: inside this query's own queryFn, writing its own result.
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
      void applyFrame(queryClient, updateQueryKey, (prev: SpotTradeEvent[]) => {
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
          // Trim only a FULL page — see useOrderHistory: an unconditional pop
          // removed the row just added whenever the page had room.
          if (updatedTradeHistories.length > pageLimit) updatedTradeHistories.length = pageLimit;
        }
        setTotalCount(prev.length + 1);
        setTotalPages(Math.ceil((prev.length + 1) / pageLimit));
        return updatedTradeHistories;
      });
      setUpdated(true);

      // The MAKER's topic carries these frames too (Trade.ts publishes to both
      // sides), and the toast below is written from the taker's side: a maker
      // whose two asks were lifted was told "Bought … 2 fills". A maker already
      // hears about the same transaction from their ORDERS — useOrderHistory's
      // closure toast for an order cleared, useOrders' fill toast for one shrunk
      // — so on their side this frame updates the table and says nothing.
      if (!wasTaker(tradeHistoryEvent.taker, address)) return;

      // Same coalescing as useOrders, on the taker side: a market order sweeping N
      // levels produces N spotTrade frames, and the old id (`trade-history-` plus
      // the MAKER's order id) differed per fill, so every one stacked its own
      // toast. `isBid` here is the taker's own side, hence the opposite mapping to
      // useOrders -- which is why the aggregator takes a resolved side.
      //
      // Sized in BASE. `amount` is the taker's GIVEN leg — quote on a buy — so a
      // buy of 800,000 KPRF for 4.004 tUSD used to read "Bought 4.004 KPRF".
      const fill = fillsRef.current!.add({
        txHash: tradeHistoryEvent.txHash,
        pair: tradeHistoryEvent.pair,
        side: tradeHistoryEvent.isBid ? "buy" : "sell",
        matched: tradeHistoryEvent.baseAmount,
        price: tradeHistoryEvent.price,
        symbol: tradeHistoryEvent.baseSymbol,
        // No `placed`: a taker has no resting order, so there is no remainder to
        // report. Omitted rather than zeroed -- zero means "fully filled" here.
      });
      const { title, description } = describeFill(fill, (value) =>
        formatPrice(value)
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
      if (summary.fills.length === 0) return;
      // Whose envelope is it? The gateway folds a maker's fills on the MAKER's
      // topic too (ws/fillSummary.ts `foldRole`), and there every fill is against
      // a different resting order of theirs at its own price — the REST route
      // keeps those as separate rows (makerOrderKey). So a maker's envelope is
      // EXPANDED, one row per fill, and only the taker's is collapsed.
      const viewerIsTaker = wasTaker(summary.taker, address);
      const rows = viewerIsTaker
        ? [{ ...collapseFillSummary(summary), ...liveCounterparties(summary, address) }]
        : expandFillSummary(summary);

      const updateQueryKey = ["tradehistory", networkName, address, pageLimit, page];
      void applyFrame(queryClient, updateQueryKey, (prev: SpotTradeEvent[]) => {
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

      // A maker hears about this transaction from their orders (the closure
      // toast), exactly as on the per-fill path.
      if (!viewerIsTaker) return;

      // No client-side fold needed for the price: the gateway already weighted the
      // average by size. The size is summed in BASE here, not `matched`, which sums
      // the taker's given leg (quote on a buy) — see the per-fill path. The toast id
      // matches the per-fill path's so the two can never stack.
      const baseFilled = summary.fills.reduce((total, f) => total + f[4], 0);
      const fmt = (value: number) => formatPrice(value);
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
            {`${summary.isBid ? "Bought" : "Sold"} ${fmt(baseFilled)} ${summary.baseSymbol} at ${
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
