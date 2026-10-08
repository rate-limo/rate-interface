"use client";

import { Fragment, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format/price";
import { useOrderPageContext } from "@/contexts/OrderPageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import type { OrderHistoryRow } from "@/hooks/useOrderHistory";
import { AccountTableShell, EmptyRow, Pager, StatusChip, Th, Td } from "./AccountTable";
import { FillTypeLabel, OrderFillRows } from "./OrderFills";
import {
  avgFillPrice,
  formatAmount,
  formatDateTime,
  historyFills,
  historySize,
  historyStatus,
  isFinished,
  neverRested,
  orderType,
  type FillType,
  txUrl,
  type HistoryFillsSource,
} from "./orderRows";

/** A row as History renders it — one shape for the table and the phone cards. */
export type HistoryView = {
  key: string;
  pairSymbol: string;
  side: "Buy" | "Sell";
  /** Maker (it rested), Taker (it took resting orders), or Pool (only the pool filled it). */
  type: FillType;
  status: ReturnType<typeof historyStatus>;
  price: string;
  priceIsAvg: boolean;
  amount: string;
  when: string;
  tx: string | null;
  /** "3 fills · 1 via pool"; null for an order that never filled. */
  split: string | null;
  /** Where the expanded row's fill list comes from; null when there is none. */
  fills: HistoryFillsSource | null;
};

/**
 * Finished orders only, shaped for display.
 *
 * `/api/orderhistory` returns open AND finished orders on the same pages, with
 * `status` saying which (`open` · `filled` · `canceled` · `expired`). Open rows
 * belong to the Open tab and are dropped here — which means a page can come
 * back with fewer than ten finished rows, or none, while later pages hold
 * more. The gateway takes no status filter yet; the empty state says so rather
 * than claiming there is no history.
 */
export function toHistoryViews(rows: readonly OrderHistoryRow[], networkName: string): HistoryView[] {
  return rows.filter(isFinished).map((o) => {
    const crossed = neverRested(o);
    const avg = avgFillPrice(o.matchHistories ?? []);
    const asset = o.isBid ? o.quoteSymbol : o.baseSymbol;
    const { split, source, fillCount, viaPool } = historyFills(o, networkName);
    return {
      // A crossed row has no order id, and needs none: the gateway groups it
      // by (txHash, pair, side) for this wallet, and leaves out any tx that
      // wrote a rested row, so those three are already unique.
      key: `${o.txHash ?? ""}-${o.pair}-${o.isBid}-${crossed ? "crossed" : o.orderId}`,
      pairSymbol: o.pairSymbol,
      side: o.isBid ? "Buy" : "Sell",
      type: orderType(o, fillCount, viaPool),
      status: historyStatus(o),
      price: formatPrice(avg ?? o.price),
      priceIsAvg: avg !== null || crossed,
      amount: `${formatAmount(historySize(o))} ${asset}`,
      when: formatDateTime(o.timestamp),
      tx: txUrl(networkName, o.txHash),
      split,
      fills: source,
    };
  });
}

/**
 * The collapsed row's fill summary, as a toggle when there are fills to show.
 * Shared by the table and the phone cards so both expand the same way.
 */
export function FillsToggle({
  view,
  open,
  onToggle,
  className,
}: {
  view: HistoryView;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (!view.split) return <span className="text-[color:var(--m-text-secondary)]">—</span>;
  if (!view.fills) return <span className="text-[color:var(--m-text-secondary)]">{view.split}</span>;
  return (
    <button
      type="button"
      aria-expanded={open}
      data-testid="history-fills-toggle"
      onClick={onToggle}
      className={
        "inline-flex items-center gap-1 whitespace-nowrap text-[color:var(--m-text-primary)] hover:text-[color:var(--m-primary)] " +
        (className ?? "")
      }
      title={open ? "Hide the fills" : "Show each fill and who filled it"}
    >
      <span aria-hidden className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>
        ›
      </span>
      {view.split}
    </button>
  );
}

/** Which rows are expanded, by view key. */
export function useExpanded() {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { isOpen: (key: string) => open.has(key), toggle };
}

export function OrderHistory() {
  const { displayNetworkName, address } = useMarketPageContext();
  const expanded = useExpanded();
  const {
    orderHistories,
    orderHistoriesTotalCount,
    orderHistoriesTotalPages,
    orderHistoriesPage,
    setOrderHistoriesPage,
    isOrderHistoriesLoading,
  } = useOrderPageContext();

  const views = useMemo(
    () => toHistoryViews(orderHistories ?? [], displayNetworkName),
    [orderHistories, displayNetworkName],
  );
  const hiddenOpen = (orderHistories?.length ?? 0) - views.length;
  const empty =
    orderHistoriesTotalPages > 1
      ? "No finished orders on this page — open orders are under Open orders"
      : "No finished orders yet";

  return (
    <AccountTableShell
      toolbar={
        hiddenOpen > 0 ? (
          <span className="text-[color:var(--m-text-secondary)]">
            Finished orders · {hiddenOpen} still open on this page {hiddenOpen === 1 ? "is" : "are"} under Open orders
          </span>
        ) : undefined
      }
      head={
        <>
          <Th>Time</Th>
          <Th>Pair</Th>
          <Th>Type</Th>
          <Th>Side</Th>
          <Th>Status</Th>
          <Th>Fills</Th>
          <Th align="right">Price</Th>
          <Th align="right">Amount</Th>
          <Th align="right">Tx</Th>
        </>
      }
      footer={
        <Pager page={orderHistoriesPage} totalPages={orderHistoriesTotalPages} onPage={setOrderHistoriesPage} />
      }
    >
      {views.length === 0 ? (
        <EmptyRow colSpan={9} loading={isOrderHistoriesLoading && orderHistoriesTotalCount === 0} text={empty} />
      ) : (
        views.map((v) => (
          <Fragment key={v.key}>
            <tr
              data-testid="history-row"
              className="border-b border-[color:var(--m-border)] last:border-0 hover:bg-[color:var(--m-surface-2)]"
            >
              <Td className="whitespace-nowrap text-[color:var(--m-text-secondary)]">{v.when}</Td>
              <Td className="whitespace-nowrap">{v.pairSymbol}</Td>
              <Td>
                <FillTypeLabel type={v.type} />
              </Td>
              <Td className={v.side === "Buy" ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]"}>{v.side}</Td>
              <Td>
                <StatusChip kind={v.status.kind} label={v.status.label} />
              </Td>
              <Td className="whitespace-nowrap">
                <FillsToggle view={v} open={expanded.isOpen(v.key)} onToggle={() => expanded.toggle(v.key)} />
              </Td>
              <Td align="right" className="font-mono tabular-nums" title={v.priceIsAvg ? "Average fill price" : "Order price"}>
                {v.priceIsAvg ? <span className="text-[color:var(--m-text-secondary)]">avg </span> : null}
                {v.price}
              </Td>
              <Td align="right" className="font-mono tabular-nums">{v.amount}</Td>
              <Td align="right">
                {v.tx ? (
                  <a
                    href={v.tx}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--m-primary)] hover:underline"
                    title="The order's transaction on the explorer"
                  >
                    View ↗
                  </a>
                ) : (
                  <span className="text-[color:var(--m-text-secondary)]">—</span>
                )}
              </Td>
            </tr>
            {v.fills && expanded.isOpen(v.key) ? (
              <OrderFillRows
                source={v.fills}
                networkName={displayNetworkName}
                address={address}
                pairSymbol={v.pairSymbol}
                side={v.side}
              />
            ) : null}
          </Fragment>
        ))
      )}
    </AccountTableShell>
  );
}

export default OrderHistory;
