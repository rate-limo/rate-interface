"use client";

import { useState } from "react";
import { formatPct } from "@/lib/pair/derive";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { parseAbi, zeroAddress } from "viem";
import { exchangeAbi } from "@/components/abis/exchange";
import { matchingEngineAddress } from "@/lib/deployments";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { chainIds } from "@/consts";
import { activityCounts, filterActivity, type ActivityFilter } from "@/lib/portfolio/activity";
import { openOrderKey } from "@/lib/portfolio/orderIdentity";
import type { HistoryRow, IndexerData, OpenOrder, StopOrder } from "@/lib/portfolio/types";
import type { SectionKey } from "./section";
import { toastContractError } from "@/lib/errors/toastContractError";
import {
  FillBar,
  MarketCell,
  Pill,
  SidePill,
  SwapTag,
  TokenAvatar,
  ChainChip,
  TH,
  TD,
  NUM,
} from "./parts";

// The type is re-exported so existing consumers keep working; types are erased and
// cross the client boundary freely. The FUNCTION deliberately is not — see ./section.
export type { SectionKey } from "./section";

/**
 * `positionsCount` is a second argument rather than a field on `IndexerData`
 * because positions come from `/api/account/:address/positions` — a different
 * route family from the per-address activity routes `usePortfolioLive` fans out
 * over, read by its own hook (see `useAccountPositions`). Folding it into the
 * indexer fixture would imply a source it does not share. Undefined renders no
 * badge, which is what a tab whose read has not resolved should show.
 */
export function tabDefs(
  data: IndexerData,
  positionsCount?: number,
): { key: SectionKey; label: string; short: string; count?: number }[] {
  return [
    // First: what the wallet holds is the question the rest of the strip
    // qualifies, and it is the one tab that survives having no open activity.
    { key: "positions", label: "Positions", short: "Positions", count: positionsCount },
    { key: "orders", label: "Open orders", short: "Orders", count: data.orders.length },
    { key: "stopOrders", label: "Stop orders", short: "Stops", count: data.stopOrders.length },
    { key: "lps", label: "LP positions", short: "LP", count: data.lps.length },
    { key: "trades", label: "Trades", short: "Trades" },
    { key: "history", label: "History", short: "History" },
    { key: "rewards", label: "Rewards", short: "Rewards" },
    { key: "referrals", label: "Referrals", short: "Referrals" },
    {
      key: "creator",
      label: "Creator",
      short: "Creator",
      count: data.creator.length,
    },
  ];
}

const stopPairAbi = parseAbi(["function getOperator() view returns (address)"]);
const stopCancelAbi = parseAbi(["function cancel(address base,address quote,bool isBid,uint32 orderId) returns (uint256 refunded)"]);

/**
 * Whether an activated stop left a book order behind to point at.
 *
 * Zero is the contract's "none", not order zero: ids start at 1 on both sides, and
 * StopOrderMatchingLib._process emits regularOrderId 0 for a stop-MARKET, which
 * never rests -- _executeMarket matches it immediately and refunds the remainder.
 * `lib/portfolio/live` already maps 0 to null, but the type permits it, so the
 * component refuses it too rather than trusting one caller to have cleaned it.
 */
function hasLinkedOrder(order: StopOrder): boolean {
  return order.regularOrderId != null && order.regularOrderId > 0;
}

/**
 * `onRefresh` arrives as a PROP rather than being reached for with `useQueryClient`.
 *
 * That was the first version and it broke every test mounting this row, because a
 * provider requirement gives a cancel button the power to take down whatever renders it
 * — the same coupling `useChainBrand` refuses for the same reason. Optional, so a mount
 * that has no refetch to offer simply shows no Refresh button.
 */
function StopCancelButton({ order, onRefresh }: { order: StopOrder; onRefresh?: () => void }) {
  const targetChainId = chainIds[order.market.network];
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: engine } = useReadContract({ abi: stopPairAbi, address: order.pairAddress, functionName: "getOperator", chainId: targetChainId });
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: targetChainId });
  const cancel = async () => {
    if (!engine || engine === zeroAddress || !publicClient) return;
    try {
      if (targetChainId && chainId !== targetChainId) await switchChainAsync({ chainId: targetChainId });
      const hash = await writeContractAsync({
        abi: stopCancelAbi,
        address: engine,
        functionName: "cancel",
        args: [order.baseAddress, order.quoteAddress, order.side === "Buy", order.orderId],
        chainId: targetChainId,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error("Stop-order cancellation reverted");
      toast.success("Stop order canceled");
    } catch (error) {
      // `targetChainId`, not the wallet's: the cancellation goes to the ORDER's
      // chain (it switches to it two lines above), so that is the chain whose gas
      // asset a shortfall has to name.
      toastContractError(error, "Could not cancel stop order", {
        chainId: targetChainId,
        // `OrderCancelFailed` means the client is acting on an order the book has
        // already removed — filled, or cancelled elsewhere. A re-read is the fix,
        // and it is the one the copy has always told the user to perform by hand.
        ...(onRefresh ? { fixes: { refresh: onRefresh } } : {}),
      });
    }
  };
  return <button type="button" disabled={!engine || engine === zeroAddress || isPending} onClick={() => void cancel()} className="rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 font-mono text-[11.5px] text-[color:var(--m-error)] disabled:opacity-40">{isPending ? "Canceling…" : "Cancel"}</button>;
}

function historyTone(s: HistoryRow["status"]): "primary" | "success" | "muted" {
  if (s === "Open") return "primary";
  if (s === "Filled") return "success";
  return "muted";
}

function rate(value: string): string {
  return value.replace(/^\$\s*/, "");
}

function orderAmount(order: OpenOrder): string {
  const symbol = order.side === "Buy" ? order.market.quote : order.market.base;
  return order.amount.toUpperCase().endsWith(` ${symbol.toUpperCase()}`)
    ? order.amount
    : `${order.amount} ${symbol}`;
}

/** Reusable card shell for the mobile "tables → cards" layout. */
function OCard({
  base,
  quote,
  network,
  right,
  kvs,
  action,
  selecting = false,
  selected = false,
  onSelect,
}: {
  base: string;
  quote: string;
  network: string;
  right?: React.ReactNode;
  kvs: { k: string; v: React.ReactNode }[];
  action?: { label: string; onClick: () => void; danger?: boolean };
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`relative rounded-[13px] border bg-[color:var(--m-surface-2)] p-3.5 transition-[border-color,padding] duration-250 motion-reduce:transition-none ${selected ? "border-[color:var(--m-primary)]" : "border-[color:var(--m-border)]"} ${selecting ? "pl-11" : ""}`}
    >
      {/* Only selectable cards get one. It used to render unconditionally, so a
          stop or LP card -- which passes no `onSelect` -- mounted a `checked` input
          with no `onChange`, which React warns about on every render and which puts
          a hidden, inert checkbox in the accessibility tree. Surfaced by the first
          component test in this app. */}
      {onSelect && (
        <div
          className={`absolute left-3.5 top-4 transition-[opacity,transform] duration-250 ease-out motion-reduce:transition-none ${selecting ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"}`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select ${base}/${quote} order`}
            className="h-4 w-4 cursor-pointer accent-[var(--m-primary)]"
          />
        </div>
      )}
      <div className="mb-2.5 flex items-center gap-2.5">
        <TokenAvatar symbol={base} size="md" />
        <b className="flex items-center gap-1.5 text-sm font-semibold">
          {base}/{quote}
          <ChainChip network={network} />
        </b>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {kvs.map((kv, i) => (
          <div key={i}>
            <div className="font-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {kv.k}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">{kv.v}</div>
          </div>
        ))}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2.5 w-full rounded-[9px] border border-[color:var(--m-border)] px-3 py-2 text-center font-mono text-[11.5px]"
          style={action.danger ? { color: "var(--m-error)" } : { color: "var(--m-primary)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ActivityContent({
  view,
  data,
  networkSlug,
  loading = false,
  onOpenOrders,
  onRefresh,
}: {
  view: SectionKey;
  data: IndexerData;
  networkSlug: string;
  /**
   * Switch to the Open orders tab. An activated stop IS an ordinary resting order,
   * so the row's only useful action is to go look at it -- there is no per-order
   * deep link and Open orders carries no id column, so a bare number would not be
   * findable by eye. Same shape as `onOpenRewards`.
   */
  onOpenOrders?: () => void;
  /** Re-read the portfolio's live data. Powers the Refresh action on a failed cancel. */
  onRefresh?: () => void;
  /**
   * Whether the indexer fan-out is still in flight.
   *
   * Load-bearing for the empty states below, not decoration. "You have no stop
   * orders" is a CLAIM, and rendering it while the answer is still arriving
   * asserts something we do not know — the same reason every status-bar chip
   * degrades to an em-dash rather than to a zero. It matters most on the path
   * that now exists: the swap card's "order placed" toast links straight here,
   * so a user arrives seconds after placing, while the row is still being
   * indexed, and being told they have none is both wrong and alarming.
   */
  loading?: boolean;
}) {
  // Held here rather than per-render so switching tabs and coming back does not
  // silently reset the filter to All while the chip still reads otherwise.
  const [tradeFilter, setTradeFilter] = useState<ActivityFilter>("all");
  const [bulkMode, setBulkMode] = useState(false);
  // Keep the exact rendered rows in selection state. Even malformed/duplicated
  // indexer identities cannot make one checkbox control another this way. When
  // a refetch replaces the row objects, the selection safely becomes empty
  // instead of being rebound to a different order.
  const [selectedOrders, setSelectedOrders] = useState<Set<OpenOrder>>(new Set());
  const { writeContractAsync, isPending: isCancelPending } = useWriteContract();
  const router = useRouter();
  const cancel = (label: string) => toast(`Cancel requested · ${label}`);
  const manage = (base: string, quote: string) => {
    router.push(buildPageUrl("pool", { slug: networkSlug, deposit: true, base, quote }));
  };

  if (view === "orders") {
    const rows = data.orders;
    if (rows.length === 0) {
      return (
        <TabEmpty
          loading={loading}
          glyph="◇"
          title="No open orders"
          body="A limit order that does not fill immediately rests here until the market crosses your price, or you cancel it."
          cta="Place an order"
          href={buildPageUrl("trade", { slug: networkSlug })}
        />
      );
    }
    const selectableRows = rows.filter(
      (order): order is OpenOrder & Required<Pick<OpenOrder, "orderId" | "baseAddress" | "quoteAddress">> =>
        order.orderId !== undefined && Boolean(order.baseAddress) && Boolean(order.quoteAddress),
    );
    const selectedCancelableOrders = selectableRows.filter((order) => selectedOrders.has(order));
    const selectedCount = selectedCancelableOrders.length;
    const toggleOrder = (order: OpenOrder) => {
      if (!openOrderKey(order)) return;
      setSelectedOrders((current) => {
        const next = new Set(current);
        if (next.has(order)) next.delete(order);
        else next.add(order);
        return next;
      });
    };
    const leaveBulkMode = () => {
      setBulkMode(false);
      setSelectedOrders(new Set());
    };
    const submitBulkCancel = async () => {
      if (!selectedCount || isCancelPending) return;
      const networkName = selectedCancelableOrders[0].market.network;
      const matchingEngine = matchingEngineAddress(networkName);
      if (!matchingEngine) {
        toast.error("Cancellation is unavailable on this network");
        return;
      }
      try {
        await writeContractAsync({
          address: matchingEngine,
          abi: exchangeAbi,
          functionName: "cancelOrders",
          args: [
            selectedCancelableOrders.map((order) => order.baseAddress),
            selectedCancelableOrders.map((order) => order.quoteAddress),
            selectedCancelableOrders.map((order) => order.side === "Buy"),
            selectedCancelableOrders.map((order) => BigInt(order.orderId)),
          ],
        });
        toast.success(`${selectedCount} ${selectedCount === 1 ? "order" : "orders"} submitted for cancellation`);
        leaveBulkMode();
      } catch (error) {
        console.error("Bulk order cancellation failed", error);
      }
    };
    const bulkLabel = selectedCount
      ? `Cancel ${selectedCount} ${selectedCount === 1 ? "order" : "orders"}`
      : "Bulk cancel";
    return (
      <>
        <div className="flex min-h-14 items-center justify-end gap-2 border-b border-[color:var(--m-border)] px-3.5 py-2.5 lg:hidden">
          {bulkMode && (
            <button
              type="button"
              onClick={leaveBulkMode}
              className="rounded-lg px-3 py-2 text-[12px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
            >
              Done
            </button>
          )}
          <button
            type="button"
            disabled={bulkMode && (!selectedCount || isCancelPending)}
            onClick={() => bulkMode ? void submitBulkCancel() : setBulkMode(true)}
            className="min-w-[112px] rounded-lg border border-[color:var(--m-error)] px-3.5 py-2 text-[12px] font-medium text-[color:var(--m-error)] transition-[background-color,color,opacity,transform] duration-250 hover:bg-[color:var(--m-error)] hover:text-[color:var(--m-text-primary-inverse)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
          >
            <span key={bulkLabel} className="inline-flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
              {isCancelPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {bulkLabel}
            </span>
          </button>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th
                  className={`overflow-hidden border-b border-[color:var(--m-border)] p-0 transition-[width] duration-250 motion-reduce:transition-none ${bulkMode ? "w-11" : "w-0"}`}
                >
                  <span className="sr-only">Select</span>
                </th>
                {["Market", "Side", "Rate", "Amount", "Filled", "Status"].map((h, i) => (
                  <th key={i} className={TH}>
                    {h}
                  </th>
                ))}
                <th className={`${TH} min-w-[154px] text-right`}>
                  <div className="flex items-center justify-end gap-1.5">
                    {bulkMode && (
                      <button
                        type="button"
                        onClick={leaveBulkMode}
                        className="rounded-lg px-2 py-1.5 text-[11px] font-medium normal-case tracking-normal text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
                      >
                        Done
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={bulkMode && (!selectedCount || isCancelPending)}
                      onClick={() => bulkMode ? void submitBulkCancel() : setBulkMode(true)}
                      className="min-w-[92px] rounded-lg border border-[color:var(--m-error)] px-2.5 py-1.5 text-[11px] font-medium normal-case tracking-normal text-[color:var(--m-error)] transition-[background-color,color,opacity] hover:bg-[color:var(--m-error)] hover:text-[color:var(--m-text-primary-inverse)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
                    >
                      <span key={bulkLabel} className="inline-flex items-center gap-1.5 animate-in fade-in duration-200 motion-reduce:animate-none">
                        {isCancelPending && <Loader2 className="h-3 w-3 animate-spin" />}
                        {bulkLabel}
                      </span>
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => {
                const key = openOrderKey(o);
                return (
                <tr key={key ?? i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                  <td className="border-b border-[color:var(--m-border)] p-0 text-center">
                    <div className={`overflow-hidden transition-[width,opacity,transform] duration-250 ease-out motion-reduce:transition-none ${bulkMode ? "w-11 scale-100 opacity-100" : "w-0 scale-75 opacity-0"}`}>
                      {o.orderId !== undefined && (
                        <input
                          type="checkbox"
                          checked={selectedOrders.has(o)}
                          onChange={() => toggleOrder(o)}
                          data-order-key={key}
                          aria-label={`Select ${o.market.base}/${o.market.quote} order`}
                          className="h-4 w-4 cursor-pointer accent-[var(--m-primary)]"
                        />
                      )}
                    </div>
                  </td>
                  <td className={TD}>
                    <MarketCell
                      base={o.market.base}
                      quote={o.market.quote}
                      network={o.market.network}
                      sub={
                        o.fromSwap ? (
                          <span className="flex items-center gap-1.5">
                            {o.side} · <SwapTag />
                          </span>
                        ) : undefined
                      }
                    />
                  </td>
                  <td className={TD}>
                    <SidePill side={o.side} />
                  </td>
                  <td className={`${TD} ${NUM}`}>{rate(o.price)}</td>
                  <td className={`${TD} ${NUM}`}>{orderAmount(o)}</td>
                  <td className={`${TD} ${NUM}`}>
                    {o.filledPct}%<FillBar pct={o.filledPct} />
                  </td>
                  <td className={TD}>
                    <Pill tone={o.status === "Open" ? "primary" : "accent"}>{o.status}</Pill>
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => cancel(`${o.market.base}/${o.market.quote}`)}
                      className="rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 font-mono text-[11.5px] transition-colors hover:border-[color:var(--m-error)]"
                      style={{ color: "var(--m-error)" }}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
          {rows.map((o, i) => {
            const key = openOrderKey(o);
            return (
            <OCard
              key={key ?? i}
              base={o.market.base}
              quote={o.market.quote}
              network={o.market.network}
              right={<SidePill side={o.side} />}
              kvs={[
                { k: "Rate", v: rate(o.price) },
                { k: "Amount", v: orderAmount(o) },
                {
                  k: "Filled",
                  v: (
                    <>
                      {o.filledPct}%<FillBar pct={o.filledPct} />
                    </>
                  ),
                },
                {
                  k: "Status",
                  v: (
                    <span className="flex items-center gap-1.5">
                      <Pill tone={o.status === "Open" ? "primary" : "accent"}>{o.status}</Pill>
                      {o.fromSwap && <SwapTag />}
                    </span>
                  ),
                },
              ]}
              action={{
                label: "Cancel order",
                danger: true,
                onClick: () => cancel(`${o.market.base}/${o.market.quote}`),
              }}
              selecting={bulkMode}
              selected={selectedOrders.has(o)}
              onSelect={key === undefined ? undefined : () => toggleOrder(o)}
            />
            );
          })}
        </div>
      </>
    );
  }

  if (view === "stopOrders") {
    const rows = [...data.stopOrders, ...data.stopOrderHistory.filter((order) => order.status !== "Open")];
    if (rows.length === 0) {
      return (
        <TabEmpty
          loading={loading}
          glyph="◈"
          title="No stop orders"
          body="A stop order waits off the book until the market reaches your trigger, then places a limit order for you. Nothing is reserved until it fires."
          cta="Place a stop order"
          href={buildPageUrl("trade", { slug: networkSlug })}
        />
      );
    }
    return (
      <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>{["Market", "Type", "Side", "Trigger", "Limit", "Amount", "Expiry", "State", ""].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((order) => <tr key={`${order.pairAddress}:${order.side}:${order.orderId}:${order.status}`} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
              <td className={TD}><MarketCell base={order.market.base} quote={order.market.quote} network={order.market.network} /></td>
              <td className={TD}>{order.kind}</td><td className={TD}><SidePill side={order.side} /></td>
              <td className={`${TD} ${NUM}`}>{order.triggerPrice}</td><td className={`${TD} ${NUM}`}>{order.kind === "Stop-market" ? "Market" : order.limitPrice}</td>
              <td className={`${TD} ${NUM}`}>{order.amount}</td><td className={`${TD} ${NUM}`}>{order.deadline ? new Date(order.deadline * 1000).toLocaleString() : "GTC"}</td>
              <td className={TD}><Pill tone={order.status === "Open" ? "primary" : order.status === "Activated" ? "success" : "muted"}>{order.status}</Pill></td>
              <td className={TD}>
                {order.status === "Open" && <StopCancelButton order={order} onRefresh={onRefresh} />}
                {order.status === "Activated" && hasLinkedOrder(order) && (
                  <button
                    type="button"
                    onClick={onOpenOrders}
                    title={`This stop triggered and became resting order #${order.regularOrderId}. Cancel or manage it from Open orders.`}
                    className="rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 font-mono text-[11.5px] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
                  >
                    View order #{order.regularOrderId}
                  </button>
                )}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">{rows.map((order) => <div key={`${order.pairAddress}:${order.side}:${order.orderId}:${order.status}`}><OCard base={order.market.base} quote={order.market.quote} network={order.market.network} right={<Pill tone={order.status === "Open" ? "primary" : order.status === "Activated" ? "success" : "muted"}>{order.status}</Pill>} kvs={[{ k: "Type", v: order.kind }, { k: "Side", v: <SidePill side={order.side} /> }, { k: "Trigger", v: order.triggerPrice }, { k: "Limit", v: order.kind === "Stop-market" ? "Market" : order.limitPrice }, { k: "Amount", v: order.amount }, { k: "Expiry", v: order.deadline ? new Date(order.deadline * 1000).toLocaleString() : "GTC" }]} action={order.status === "Activated" && hasLinkedOrder(order) && onOpenOrders ? { label: `View order #${order.regularOrderId}`, onClick: onOpenOrders } : undefined} />{order.status === "Open" && <div className="-mt-1 rounded-b-[13px] border border-t-0 border-[color:var(--m-border)] p-2 text-right"><StopCancelButton order={order} onRefresh={onRefresh} /></div>}</div>)}</div>
      </>
    );
  }

  if (view === "lps") {
    const rows = data.lps;
    if (rows.length === 0) {
      return (
        <TabEmpty
          loading={loading}
          glyph="◎"
          title="No liquidity positions"
          body="Provide liquidity over a price range to earn fees from swaps that cross it. A swap's unfilled remainder can also land here as a single-sided range."
          cta="Provide liquidity"
          href={buildPageUrl("pool", { slug: networkSlug })}
        />
      );
    }
    return (
      <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Pool", "Provided", "APR", "Fees earned", "Range", ""].map((h, i) => (
                  <th key={i} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => (
                <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                  <td className={TD}>
                    <MarketCell
                      base={l.market.base}
                      quote={l.market.quote}
                      network={l.market.network}
                      sub={
                        <span className="flex items-center gap-1.5">
                          {l.singleSided ? "single-sided" : "range"}
                          {l.fromSwap && (
                            <>
                              {" · "}
                              <SwapTag />
                            </>
                          )}
                        </span>
                      }
                    />
                  </td>
                  <td className={`${TD} ${NUM}`}>{l.provided}</td>
                  {/* Null is "not measurable", never zero — `~0%` and `+$0.00`
                      both assert a measurement that was never taken. APR is the
                      POOL's realised figure; fees have no per-position source. */}
                  <td className={`${TD} ${NUM}`} style={{ color: "var(--m-logo)" }}>
                    {l.aprPct === null ? "—" : `~${formatPct(l.aprPct)}`}
                  </td>
                  <td className={`${TD} ${NUM}`} style={{ color: "var(--m-success)" }}>
                    {l.feesEarnedUsd === null ? "—" : `+$${l.feesEarnedUsd.toFixed(2)}`}
                  </td>
                  <td className={TD}>
                    <Pill tone={l.inRange ? "logo" : "muted"}>
                      {l.inRange ? "In-range" : "Out of range"}
                    </Pill>
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => manage(l.market.base, l.market.quote)}
                      className="rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 font-mono text-[11.5px] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
          {rows.map((l, i) => (
            <OCard
              key={i}
              base={l.market.base}
              quote={l.market.quote}
              network={l.market.network}
              right={<Pill tone={l.inRange ? "logo" : "muted"}>{l.inRange ? "In-range" : "Out"}</Pill>}
              kvs={[
                { k: "Provided", v: l.provided },
                {
                  k: "APR",
                  v: (
                    <span style={{ color: "var(--m-logo)" }}>
                      {l.aprPct === null ? "—" : `~${formatPct(l.aprPct)}`}
                    </span>
                  ),
                },
                {
                  k: "Fees earned",
                  v: (
                    <span style={{ color: "var(--m-success)" }}>
                      {l.feesEarnedUsd === null ? "—" : `+$${l.feesEarnedUsd.toFixed(2)}`}
                    </span>
                  ),
                },
                { k: "Type", v: l.singleSided ? "single-sided" : "range" },
              ]}
              action={{
                label: "Manage position",
                onClick: () => manage(l.market.base, l.market.quote),
              }}
            />
          ))}
        </div>
      </>
    );
  }

  if (view === "trades") {
    const all = data.trades;
    const rows = filterActivity(all, tradeFilter);
    const counts = activityCounts(all);
    // Never traded at all. The filter strip is hidden with it: three buttons
    // reading 0/0/0 offer a choice between three empty views.
    if (all.length === 0) {
      return (
        <TabEmpty
          loading={loading}
          glyph="⇄"
          title="No trades yet"
          body="Every fill lands here — swaps and order fills alike — with the price it executed at and a link to the transaction."
          cta="Make a trade"
          href={buildPageUrl("trade", { slug: networkSlug })}
        />
      );
    }
    return (
      <>
        {/* Filters, not tabs. The strip is already six tabs plus a conditional
            Creator, and splitting a wallet's history across an eighth would mean
            checking two places to total a day. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(["all", "swaps", "orders"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTradeFilter(f)}
              aria-pressed={tradeFilter === f}
              className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
                tradeFilter === f
                  ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)]/10 text-[color:var(--m-primary)]"
                  : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)] hover:text-[color:var(--m-text)]"
              }`}
            >
              {f} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
        {/* Has traded, just not this KIND. A "make a trade" call to action here
            would be wrong — they have; the fix is the filter above, which is why
            it stays on screen and this says which one is empty. Same distinction
            the search modal draws between "no results" and "does not exist". */}
        {rows.length === 0 && (
          <div className="px-6 py-9 text-center text-[13px] text-[color:var(--m-text-secondary)]">
            No {tradeFilter} in your history. Switch the filter to see your other activity.
          </div>
        )}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Market", "Side", "Rate", "Amount", "Value", "Time", ""].map((h, i) => (
                  <th key={i} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                  {t.kind === "swap" ? (
                    <>
                      {/* A swap has no single market — a multi-hop route crosses
                          several — so it names its two tokens and its venue, and
                          never expands into the fills underneath it. */}
                      <td className={TD} colSpan={2}>
                        <span className="font-medium">
                          {t.payAmount} {t.paySymbol} → {t.receiveAmount} {t.receiveSymbol}
                        </span>
                        <span className="ml-2 rounded-full bg-[color:var(--m-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
                          Swap
                        </span>
                      </td>
                      <td className={`${TD} ${NUM}`}>{t.rate}</td>
                      <td className={`${TD} ${NUM}`}>{t.payAmount}</td>
                      <td className={`${TD} ${NUM}`} style={{ color: "var(--m-text-secondary-2)" }}>
                        via Pool
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={TD}>
                        <MarketCell base={t.market.base} quote={t.market.quote} network={t.market.network} />
                      </td>
                      <td className={TD}>
                        <SidePill side={t.side} />
                      </td>
                      <td className={`${TD} ${NUM}`}>{rate(t.price)}</td>
                      <td className={`${TD} ${NUM}`}>{t.amount}</td>
                      <td className={`${TD} ${NUM}`}>${t.valueUsd}</td>
                    </>
                  )}
                  <td className={`${TD} ${NUM}`} style={{ color: "var(--m-text-secondary-2)" }}>
                    {t.time}
                  </td>
                  <td className={TD}>
                    <a
                      href={`#${t.txHash}`}
                      title={t.txHash}
                      className="font-mono text-xs text-[color:var(--m-primary)]"
                    >
                      tx ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
          {rows.map((t, i) =>
            t.kind === "swap" ? (
              // The swap's own card: two tokens and a rate, no market and no
              // side — it has neither, and inventing them would misdescribe it.
              <OCard
                key={i}
                base={t.paySymbol}
                quote={t.receiveSymbol}
                network={t.network}
                right={
                  <span className="rounded-full bg-[color:var(--m-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
                    Swap
                  </span>
                }
                kvs={[
                  { k: "Paid", v: `${t.payAmount} ${t.paySymbol}` },
                  { k: "Received", v: `${t.receiveAmount} ${t.receiveSymbol}` },
                  { k: "Rate", v: `1 ${t.paySymbol} = ${t.rate} ${t.receiveSymbol}` },
                  { k: "Venue", v: "Pool" },
                  {
                    k: "Time",
                    v: (
                      <a href={`#${t.txHash}`} className="text-[color:var(--m-primary)]">
                        {t.time} · tx ↗
                      </a>
                    ),
                  },
                ]}
              />
            ) : (
              <OCard
                key={i}
                base={t.market.base}
                quote={t.market.quote}
                network={t.market.network}
                right={<SidePill side={t.side} />}
                kvs={[
                  { k: "Rate", v: rate(t.price) },
                  { k: "Amount", v: t.amount },
                  { k: "Value", v: `$${t.valueUsd}` },
                  {
                    k: "Time",
                    v: (
                      <a
                        href={`#${t.txHash}`}
                        className="text-[color:var(--m-primary)]"
                      >
                        {t.time} · tx ↗
                      </a>
                    ),
                  },
                ]}
              />
            ),
          )}
        </div>
      </>
    );
  }

  // history
  const rows = data.history;
  if (rows.length === 0) {
    return (
      <TabEmpty
        loading={loading}
        glyph="⧗"
        title="No order history"
        body="Orders appear here once they close — filled or cancelled — with the price and size they ended at. Orders still working are under Open orders."
        cta="Place an order"
        href={buildPageUrl("trade", { slug: networkSlug })}
      />
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Market", "Type", "Side", "Rate", "Size", "Status", "Time"].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                <td className={TD}>
                  <MarketCell base={h.market.base} quote={h.market.quote} network={h.market.network} />
                </td>
                <td className={`${TD} ${NUM}`} style={{ color: "var(--m-text-secondary)" }}>
                  {h.type}
                </td>
                <td className={TD}>
                  <SidePill side={h.side} />
                </td>
                <td className={`${TD} ${NUM}`}>{rate(h.price)}</td>
                <td className={`${TD} ${NUM}`}>{h.size}</td>
                <td className={TD}>
                  <Pill tone={historyTone(h.status)}>{h.status}</Pill>
                </td>
                <td className={`${TD} ${NUM}`} style={{ color: "var(--m-text-secondary-2)" }}>
                  {h.time}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
        {rows.map((h, i) => (
          <OCard
            key={i}
            base={h.market.base}
            quote={h.market.quote}
            network={h.market.network}
            right={<Pill tone={historyTone(h.status)}>{h.status}</Pill>}
            kvs={[
              { k: "Type", v: h.type },
              { k: "Side", v: <SidePill side={h.side} /> },
              { k: "Rate", v: rate(h.price) },
              { k: "Size", v: h.size },
              { k: "Time", v: h.time },
            ]}
          />
        ))}
      </div>
    </>
  );
}

/**
 * The empty state for an activity tab.
 *
 * Modelled on `CreatorEmpty` so the two do not drift into different shapes for
 * the same job. Two rules it exists to keep:
 *
 * **It says nothing while loading.** An empty state is an assertion — "you have
 * none" — and making it before the fan-out returns is a claim we cannot support.
 * The swap card's toast links straight to these tabs, so the common arrival is
 * seconds after placing an order, with the row still being indexed; telling that
 * user they have no orders is wrong and reads as a lost trade.
 *
 * **It offers the action, not just the absence.** A tab that says only "nothing
 * here" leaves the reader to find the place that would change that.
 */
function TabEmpty({
  loading,
  glyph,
  title,
  body,
  cta,
  href,
}: {
  loading: boolean;
  glyph: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2.5 p-3.5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your activity</span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-[12px] bg-[color:var(--m-surface-2)]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-11 text-center">
      <span
        className="grid h-11 w-11 place-items-center rounded-[12px] text-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--m-primary) 14%, transparent)",
          color: "var(--m-primary)",
        }}
      >
        {glyph}
      </span>
      <h3 className="mt-1 text-base font-semibold">{title}</h3>
      <p className="max-w-[44ch] text-[13px] text-[color:var(--m-text-secondary)]">{body}</p>
      <Link
        href={href}
        className="mt-1.5 rounded-[10px] border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--m-on-primary)]"
      >
        {cta}
      </Link>
    </div>
  );
}
