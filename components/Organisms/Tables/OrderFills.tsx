"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSpotAccountTradeFills } from "@/queries/server/tradehistories";
import { useIdentities } from "@/hooks/useIdentities";
import { counterpartyAddresses } from "@/lib/trades/counterparty";
import { CounterpartyCell } from "./Counterparty";
import { StatusChip } from "./AccountTable";
import { toFillDetailViews, type FillDetailView, type FillType, type HistoryFillsSource } from "./orderRows";
import { cn } from "@/lib/utils";

/**
 * The fills behind one History row, listed when the row is expanded.
 *
 * A rested order brought its fills with it; a crossed order's are fetched on
 * first expand, once, from the same drill-down route the gateway serves for a
 * grouped trade — so a page of History costs no extra requests until someone
 * asks to look inside a row.
 */
/**
 * The fill rows for one History row: inline ones as they arrived, a crossed
 * order's fetched on first expand, plus one identity lookup for every
 * counterparty in the list.
 */
function useFillRows(source: HistoryFillsSource, networkName: string, address: string | undefined) {
  const lazy = source.kind === "lazy" ? source : null;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["orderfills", networkName, address, lazy?.txHash, lazy?.pair],
    queryFn: async () =>
      toFillDetailViews(
        await getSpotAccountTradeFills(networkName, address as string, lazy!.txHash, lazy!.pair),
        address,
        // A crossed order never rested, so its book fills were taken.
        { rested: false, networkName },
      ),
    enabled: lazy !== null && !!address,
    // A settled transaction's fills do not change.
    staleTime: Infinity,
  });

  const rows: FillDetailView[] | undefined = source.kind === "inline" ? source.rows : data;
  // One lookup per expanded list, for every fill's counterparty in it. Per
  // list rather than per table: a crossed order's fills only exist once it is
  // opened, so the table cannot know these addresses up front.
  const identities = useIdentities(
    networkName,
    useMemo(() => counterpartyAddresses((rows ?? []).map((f) => f.counterparty)), [rows]),
  );
  const message = !rows
    ? isError
      ? "Could not load the fills"
      : isLoading || !address
        ? "Loading fills…"
        : "No fills"
    : rows.length === 0
      ? "No fills"
      : null;
  return { rows, identities, message };
}

/** The phone cards' list: two lines per fill. */
export function OrderFills({
  source,
  networkName,
  address,
}: {
  source: HistoryFillsSource;
  networkName: string;
  address: string | undefined;
}) {
  const { rows, identities, message } = useFillRows(source, networkName, address);
  if (message || !rows) {
    return <p className="py-2 text-[11.5px] text-[color:var(--m-text-secondary)]">{message}</p>;
  }

  return (
    <ul data-testid="order-fills" className="flex flex-col divide-y divide-[color:var(--m-border)]">
      {rows.map((f) => (
        // Two lines on a phone (time · type · who, then price · size), one row from sm up.
        <li
          key={f.key}
          data-testid="order-fill"
          className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 py-1.5 font-mono text-[11.5px] tabular-nums sm:grid-cols-[auto_1fr_1fr_auto]"
        >
          <span className="order-1 text-[color:var(--m-text-secondary)] sm:order-none">
            {f.when} · <span className="font-sans text-[color:var(--m-text-primary)]">{f.type}</span>
          </span>
          <span className="order-3 sm:order-none sm:text-right">@ {f.price}</span>
          <span className="order-4 text-right sm:order-none">
            {f.amount}
            <span className="block text-[10.5px] text-[color:var(--m-text-secondary)]" title={f.fee.title}>
              fee {f.fee.text}
            </span>
          </span>
          <span className="order-2 min-w-0 justify-self-end font-sans sm:order-none">
            <CounterpartyCell view={f.counterparty} networkName={networkName} nameOf={identities.nameOf} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The desktop table's fills: one real row per fill, in the History table's own
 * nine columns, so every column says something for a fill too: its time, the
 * order's pair and side, how it executed (Pool, Maker or Taker), "Filled", who
 * was on the other side, its price, its size and fee, and its transaction.
 */
export function OrderFillRows({
  source,
  networkName,
  address,
  pairSymbol,
  side,
}: {
  source: HistoryFillsSource;
  networkName: string;
  address: string | undefined;
  pairSymbol: string;
  side: "Buy" | "Sell";
}) {
  const { rows, identities, message } = useFillRows(source, networkName, address);
  const cell = "px-3 py-1.5 text-[11.5px] align-middle";
  if (message || !rows) {
    return (
      <tr className="border-b border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/40">
        <td colSpan={9} className={cn(cell, "pl-6 text-[color:var(--m-text-secondary)]")}>
          {message}
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((f) => (
        <tr
          key={f.key}
          data-testid="history-fill"
          className="border-b border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/40"
        >
          <td className={cn(cell, "whitespace-nowrap pl-6 font-mono tabular-nums text-[color:var(--m-text-secondary)]")}>
            <span aria-hidden className="mr-1.5 text-[color:var(--m-text-secondary-2)]">└</span>
            {f.when}
          </td>
          <td className={cn(cell, "whitespace-nowrap text-[color:var(--m-text-secondary)]")}>{pairSymbol}</td>
          <td className={cell}>
            <FillTypeLabel type={f.type} />
          </td>
          <td className={cn(cell, side === "Buy" ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]")}>
            {side}
          </td>
          <td className={cell}>
            <StatusChip kind="filled" label="Filled" />
          </td>
          <td className={cn(cell, "min-w-0")}>
            <CounterpartyCell view={f.counterparty} networkName={networkName} nameOf={identities.nameOf} />
          </td>
          <td className={cn(cell, "text-right font-mono tabular-nums")} title="This fill's price">
            {f.price}
          </td>
          <td className={cn(cell, "text-right font-mono tabular-nums")}>
            {f.amount}
            <span className="block text-[10.5px] text-[color:var(--m-text-secondary)]" title={f.fee.title}>
              fee {f.fee.text}
            </span>
          </td>
          <td className={cn(cell, "text-right")}>
            {f.tx ? (
              <a
                href={f.tx}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:var(--m-primary)] hover:underline"
                title="This fill's transaction on the explorer"
              >
                View ↗
              </a>
            ) : (
              <span className="text-[color:var(--m-text-secondary)]">—</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

/** Pool / Maker / Taker, the same words the order row uses. */
export function FillTypeLabel({ type }: { type: FillType }) {
  return (
    <span
      data-testid="fill-type"
      className={cn(type === "Pool" ? "text-[color:var(--m-primary)]" : "text-[color:var(--m-text-primary)]")}
    >
      {type}
    </span>
  );
}
