"use client";

import { fillProgress, formatFillProgress } from "@/lib/orders/fillProgress";
import { FillRing } from "./FillRing";
import { formatPrice } from "@/lib/format/price";
import { useOrderPageContext } from "@/contexts/OrderPageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { networkNameToSlug } from "@/consts";
import { ShareRateButton } from "@/components/Share/ShareRateButton";
import type { SpotOrderEvent } from "@/types";
import { CancelOrderButton } from "./CancelOrderButton";
import { AccountTableShell, EmptyRow, Pager, Th, Td } from "./AccountTable";
import { formatAmount, formatDateTime, txUrl } from "./orderRows";

/** The deposit asset an order holds: quote for a bid, base for an ask. */
export function orderAsset(o: Pick<SpotOrderEvent, "isBid" | "baseSymbol" | "quoteSymbol">): string {
  return o.isBid ? o.quoteSymbol : o.baseSymbol;
}

/**
 * Open orders, desktop. Every row here is an order the chain has not cleared
 * (see "Order state comes from the chain" in apps/web/CLAUDE.md), so the Filled
 * column may approach but never claim 100%.
 *
 * Cancel acts on THAT row — the old handler toggled the row's selection and then
 * read the selection model, which had not re-rendered yet, so the first click
 * cancelled nothing (or the previous selection).
 */
export function OpenOrders() {
  const { displayNetworkName } = useMarketPageContext();
  const { orders, ordersTotalCount, ordersTotalPages, ordersPage, setOrdersPage, isOrdersLoading } =
    useOrderPageContext();
  const chainSlug = networkNameToSlug[displayNetworkName];
  const rows = orders ?? [];

  return (
    <AccountTableShell
      toolbar={
        <>
          <span className="text-[color:var(--m-text-secondary)]">
            {ordersTotalCount > 0 ? `${ordersTotalCount} open` : null}
          </span>
          {rows.length > 1 ? (
            <CancelOrderButton orders={rows} label="Cancel all" ariaLabel="Cancel all open orders" />
          ) : null}
        </>
      }
      head={
        <>
          <Th>Placed</Th>
          <Th>Pair</Th>
          <Th>Type</Th>
          <Th>Side</Th>
          <Th align="right">Price</Th>
          <Th align="right">Amount</Th>
          <Th align="right">Filled</Th>
          <Th align="right">
            <span className="sr-only">Actions</span>
          </Th>
        </>
      }
      footer={<Pager page={ordersPage} totalPages={ordersTotalPages} onPage={setOrdersPage} />}
    >
      {rows.length === 0 ? (
        <EmptyRow colSpan={8} loading={isOrdersLoading} text="No open orders" />
      ) : (
        rows.map((o) => {
          const progress = fillProgress(o as never);
          const { label, title } = formatFillProgress(progress);
          const tx = txUrl(displayNetworkName, o.txHash);
          return (
            <tr
              key={`${o.pair}-${o.isBid}-${o.orderId}`}
              data-testid="open-order-row"
              data-order-id={o.orderId}
              className="border-b border-[color:var(--m-border)] last:border-0 hover:bg-[color:var(--m-surface-2)]"
            >
              <Td className="whitespace-nowrap text-[color:var(--m-text-secondary)]">
                {tx ? (
                  <a href={tx} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--m-primary)]" title="Placement transaction">
                    {formatDateTime(o.timestamp)} ↗
                  </a>
                ) : (
                  formatDateTime(o.timestamp)
                )}
              </Td>
              <Td className="whitespace-nowrap">{o.pairSymbol}</Td>
              <Td>Limit</Td>
              <Td className={o.isBid ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]"}>
                {o.isBid ? "Buy" : "Sell"}
              </Td>
              <Td align="right" className="font-mono tabular-nums">
                {formatPrice(o.price)} <span className="text-[color:var(--m-text-secondary)]">{o.quoteSymbol}</span>
              </Td>
              <Td align="right" className="font-mono tabular-nums">
                {formatAmount(o.amount)} <span className="text-[color:var(--m-text-secondary)]">{orderAsset(o)}</span>
              </Td>
              <Td align="right" className="font-mono tabular-nums" title={title}>
                <span className="inline-flex items-center justify-end gap-1.5">
                  <FillRing progress={progress} />
                  {label}
                </span>
              </Td>
              <Td align="right">
                <div className="flex items-center justify-end gap-2">
                  {chainSlug ? <ShareRateButton chainSlug={chainSlug} order={o} /> : null}
                  <CancelOrderButton orders={[o]} />
                </div>
              </Td>
            </tr>
          );
        })
      )}
    </AccountTableShell>
  );
}

export default OpenOrders;
