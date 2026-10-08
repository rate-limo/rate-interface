"use client";

import { useMemo } from "react";
import { formatPrice } from "@/lib/format/price";
import { useOrderPageContext } from "@/contexts/OrderPageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import type { SpotTradeEvent } from "@/types";
import { viewerBought, viewerRole } from "@/lib/trades/perspective";
import { counterpartyAddresses, counterpartyOf, type CounterpartyRow, type CounterpartyView } from "@/lib/trades/counterparty";
import { useIdentities } from "@/hooks/useIdentities";
import { AccountTableShell, EmptyRow, Pager, Th, Td } from "./AccountTable";
import { CounterpartyCell } from "./Counterparty";
import { fillFeeLabel, formatAmount, formatDateTime, txUrl } from "./orderRows";

/** A fill as the account tabs render it — shared by the table and the cards. */
export type FillView = {
  key: string;
  pairSymbol: string;
  side: "Buy" | "Sell";
  role: string;
  /** Who the viewer traded with — see lib/trades/counterparty. */
  counterparty: CounterpartyView;
  price: string;
  executed: string;
  total: string;
  fee: string;
  /** The fee is an estimate (a pool fee not reproducible to the unit). */
  feeEstimated: boolean;
  /** What the fee is, for the cell's tooltip. */
  feeTitle: string;
  when: string;
  tx: string | null;
};

/**
 * Side and role are the VIEWER's (lib/trades/perspective): a maker whose resting
 * sell was hit by a buy has sold. The fee is `fillFeeLabel`'s: 0 for a maker, a
 * pool's recovered fee for a pool fill, else the broker's recorded taker fee —
 * it used to be `amount × 0.001`, a number nothing on chain ever charged.
 */
export function toFillViews(
  rows: readonly (SpotTradeEvent &
    Omit<CounterpartyRow, "taker" | "maker" | "makerOrderId" | "orderId"> & {
    poolFee?: number | null;
    poolFeeEstimated?: boolean | null;
  })[],
  viewer: string | undefined,
  networkName: string,
): FillView[] {
  return rows.map((t, i) => {
    const bought = viewerBought(t.isBid, t.taker, viewer);
    const fee = fillFeeLabel(t, viewer);
    return {
      key: `${t.txHash}-${t.pair}-${t.orderId}-${i}`,
      pairSymbol: t.pairSymbol,
      side: bought ? "Buy" : "Sell",
      role: viewerRole(t.taker, viewer),
      counterparty: counterpartyOf(t, viewer),
      price: formatPrice(t.price),
      executed: `${formatAmount(t.baseAmount)} ${t.baseSymbol}`,
      total: `${formatAmount(t.quoteAmount)} ${t.quoteSymbol}`,
      fee: fee.text,
      feeEstimated: fee.estimated,
      feeTitle: fee.title,
      when: formatDateTime(t.timestamp),
      tx: txUrl(networkName, t.txHash),
    };
  });
}

export function TradeHistory() {
  const { displayNetworkName, address } = useMarketPageContext();
  const {
    tradeHistories,
    tradeHistoriesTotalPages,
    tradeHistoriesPage,
    setTradeHistoriesPage,
    isTradeHistoriesLoading,
  } = useOrderPageContext();

  const views = useMemo(
    () => toFillViews(tradeHistories ?? [], address, displayNetworkName),
    [tradeHistories, address, displayNetworkName],
  );
  // One batched lookup for every wallet the page can show, including those
  // behind a "N traders" toggle. Addresses render first; names swap in.
  const identities = useIdentities(
    displayNetworkName,
    useMemo(() => counterpartyAddresses(views.map((v) => v.counterparty)), [views]),
  );

  return (
    <AccountTableShell
      head={
        <>
          <Th>Time</Th>
          <Th>Pair</Th>
          <Th>Side</Th>
          <Th>Role</Th>
          <Th>Counterparty</Th>
          <Th align="right">Price</Th>
          <Th align="right">Executed</Th>
          <Th align="right">Total</Th>
          <Th align="right">Fee</Th>
          <Th align="right">Tx</Th>
        </>
      }
      footer={<Pager page={tradeHistoriesPage} totalPages={tradeHistoriesTotalPages} onPage={setTradeHistoriesPage} />}
    >
      {views.length === 0 ? (
        <EmptyRow colSpan={10} loading={isTradeHistoriesLoading} text="No fills yet" />
      ) : (
        views.map((v) => (
          <tr
            key={v.key}
            data-testid="fill-row"
            className="border-b border-[color:var(--m-border)] last:border-0 hover:bg-[color:var(--m-surface-2)]"
          >
            <Td className="whitespace-nowrap text-[color:var(--m-text-secondary)]">{v.when}</Td>
            <Td className="whitespace-nowrap">{v.pairSymbol}</Td>
            <Td className={v.side === "Buy" ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]"}>{v.side}</Td>
            <Td>{v.role}</Td>
            <Td className="max-w-[180px]">
              <CounterpartyCell view={v.counterparty} networkName={displayNetworkName} nameOf={identities.nameOf} />
            </Td>
            <Td align="right" className="font-mono tabular-nums">{v.price}</Td>
            <Td align="right" className="font-mono tabular-nums">{v.executed}</Td>
            <Td align="right" className="font-mono tabular-nums">{v.total}</Td>
            <Td
              align="right"
              className="font-mono tabular-nums"
              title={v.feeTitle}
            >
              {v.fee}
            </Td>
            <Td align="right">
              {v.tx ? (
                <a href={v.tx} target="_blank" rel="noopener noreferrer" className="text-[color:var(--m-primary)] hover:underline">
                  View ↗
                </a>
              ) : (
                <span className="text-[color:var(--m-text-secondary)]">—</span>
              )}
            </Td>
          </tr>
        ))
      )}
    </AccountTableShell>
  );
}

export default TradeHistory;
