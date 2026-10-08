"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format/price";
import { fillProgress, formatFillProgress } from "@/lib/orders/fillProgress";
import { useOrderPageContext } from "@/contexts/OrderPageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { CancelOrderButton } from "@/components/Organisms/Tables/CancelOrderButton";
import { Pager, StatusChip } from "@/components/Organisms/Tables/AccountTable";
import { CounterpartyList, CounterpartySummary } from "@/components/Organisms/Tables/Counterparty";
import { counterpartyAddresses } from "@/lib/trades/counterparty";
import { useIdentities } from "@/hooks/useIdentities";
import { orderAsset } from "@/components/Organisms/Tables/OpenOrders";
import { FillsToggle, toHistoryViews, useExpanded } from "@/components/Organisms/Tables/OrderHistory";
import { OrderFills } from "@/components/Organisms/Tables/OrderFills";
import { FillRing } from "@/components/Organisms/Tables/FillRing";
import { toFillViews } from "@/components/Organisms/Tables/TradeHistory";
import { formatAmount, formatDateTime } from "@/components/Organisms/Tables/orderRows";
import { TAB_BAR_CLEARANCE } from "@/components/Shell/MobileTabs";
import { Holdings } from "./Holdings";

type Seg = "open" | "history" | "fills" | "balances";

/**
 * The account area on a phone (below 1200px): cards, not the desktop tables.
 *
 * The tables are ~1,100px wide; in a 390px screen the side and the cancel
 * control sat behind a sideways scroll. Each order is a card here, with the
 * facts a trader scans for on two lines and a 44px Cancel on the card itself.
 */
export function PhoneAccount() {
  const [seg, setSeg] = useState<Seg>("open");
  const { ordersTotalCount, orders } = useOrderPageContext();
  const openCount = ordersTotalCount || orders?.length || 0;

  const SEGS: { key: Seg; label: string; count?: number }[] = [
    { key: "open", label: "Open", count: openCount },
    { key: "history", label: "History" },
    { key: "fills", label: "Fills" },
    { key: "balances", label: "Balances" },
  ];

  return (
    <div className="flex flex-col" data-testid="phone-account">
      <div
        role="tablist"
        aria-label="Your orders and balances"
        className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-3"
      >
        {SEGS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={seg === s.key}
            onClick={() => setSeg(s.key)}
            className={cn(
              "inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border px-3.5 text-[12.5px] transition-colors",
              seg === s.key
                ? "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]"
                : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]",
            )}
          >
            {s.label}
            {s.count ? <span className="font-mono text-[color:var(--m-primary)]">{s.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="px-3">
        {seg === "open" ? <OpenCards /> : seg === "history" ? <HistoryCards /> : seg === "fills" ? <FillCards /> : null}
      </div>
      {seg === "balances" ? <Holdings /> : null}
    </div>
  );
}

function Card({ children, testId, orderId }: { children: React.ReactNode; testId: string; orderId?: number }) {
  return (
    <div
      data-testid={testId}
      data-order-id={orderId}
      className="mt-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 py-2.5"
    >
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-[12px] text-[color:var(--m-text-secondary)]">{text}</div>;
}

function Side({ side }: { side: "Buy" | "Sell" }) {
  return (
    <span className={cn("font-semibold", side === "Buy" ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]")}>
      {side}
    </span>
  );
}

function TxLink({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[color:var(--m-primary)]">
      tx ↗
    </a>
  );
}

function OpenCards() {
  const { orders, ordersTotalPages, ordersPage, setOrdersPage, isOrdersLoading } = useOrderPageContext();
  const rows = orders ?? [];
  if (rows.length === 0) return <Empty text={isOrdersLoading ? "Loading…" : "No open orders"} />;
  return (
    <>
      {rows.map((o) => {
        const progress = fillProgress(o as never);
        const { label, title } = formatFillProgress(progress);
        const width = progress.kind === "unknown" ? 0 : Math.max(0, Math.min(progress.percent, 99));
        return (
          <Card key={`${o.pair}-${o.isBid}-${o.orderId}`} testId="open-order-card" orderId={o.orderId}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-[13px]">
                <Side side={o.isBid ? "Buy" : "Sell"} />{" "}
                <span className="font-mono text-[11px] text-[color:var(--m-text-secondary)]">
                  · Limit · {o.pairSymbol} · {formatDateTime(o.timestamp)}
                </span>
              </div>
              <CancelOrderButton orders={[o]} className="shrink-0" />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[12.5px] tabular-nums">
              <span>
                {formatAmount(o.amount)} {orderAsset(o)}
              </span>
              <span>
                @ {formatPrice(o.price)} <span className="text-[color:var(--m-text-secondary)]">{o.quoteSymbol}</span>
              </span>
            </div>
            <div className="mt-2 h-[3px] overflow-hidden rounded bg-[color:var(--m-border)]" aria-hidden>
              <i className="block h-full bg-[color:var(--m-primary)]" style={{ width: `${width}%` }} />
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-[color:var(--m-text-secondary)]" title={title}>
              <FillRing progress={progress} size={12} />
              {label === "—" ? "Fill progress unavailable" : `${label} filled`}
            </div>
          </Card>
        );
      })}
      <Pager page={ordersPage} totalPages={ordersTotalPages} onPage={setOrdersPage} />
    </>
  );
}

function HistoryCards() {
  const { displayNetworkName, address } = useMarketPageContext();
  const expanded = useExpanded();
  const {
    orderHistories,
    orderHistoriesTotalPages,
    orderHistoriesPage,
    setOrderHistoriesPage,
    isOrderHistoriesLoading,
  } = useOrderPageContext();
  const views = useMemo(() => toHistoryViews(orderHistories ?? [], displayNetworkName), [orderHistories, displayNetworkName]);
  return (
    <>
      {views.length === 0 ? (
        <Empty
          text={
            isOrderHistoriesLoading
              ? "Loading…"
              : orderHistoriesTotalPages > 1
                ? "No finished orders on this page"
                : "No finished orders yet"
          }
        />
      ) : (
        views.map((v) => (
          <Card key={v.key} testId="history-card">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-[13px]">
                <Side side={v.side} />{" "}
                <span className="font-mono text-[11px] text-[color:var(--m-text-secondary)]">
                  · {v.type} · {v.pairSymbol} · {v.when}
                </span>
              </div>
              <StatusChip kind={v.status.kind} label={v.status.label} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[12.5px] tabular-nums">
              <span>{v.amount}</span>
              <span>
                {v.priceIsAvg ? "avg" : "@"} {v.price}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10.5px]">
              <FillsToggle
                view={v}
                open={expanded.isOpen(v.key)}
                onToggle={() => expanded.toggle(v.key)}
                className="min-h-[36px]"
              />
              <TxLink href={v.tx} />
            </div>
            {v.fills && expanded.isOpen(v.key) ? (
              <RevealAboveBar>
                <OrderFills source={v.fills} networkName={displayNetworkName} address={address} />
              </RevealAboveBar>
            ) : null}
          </Card>
        ))
      )}
      <Pager page={orderHistoriesPage} totalPages={orderHistoriesTotalPages} onPage={setOrderHistoriesPage} />
    </>
  );
}

/**
 * Space the fixed Buy / Sell bar and tab bar take at the bottom of the screen:
 * the tab bar's clearance plus the Buy / Sell bar (~64px) and a gap.
 */
const BOTTOM_BARS = `calc(${TAB_BAR_CLEARANCE} + 76px)`;

/**
 * An expanded fill list, scrolled into view above the bottom bars.
 *
 * Expanding a card grows it DOWNWARD, and on a phone the card being tapped is
 * usually the last thing on screen — so the list it opened landed under the
 * fixed Buy / Sell bar and looked like the tap did nothing. `scroll-margin-
 * bottom` makes "nearest" stop above the bars instead of at the viewport edge.
 *
 * It re-scrolls while the list settles (a crossed order's fills are fetched on
 * expand, so the first paint is a one-line placeholder), then lets go, so it
 * never fights a reader who has started scrolling themselves.
 */
function RevealAboveBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const reveal = () => el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(reveal);
    ro.observe(el);
    const stop = window.setTimeout(() => ro.disconnect(), 1500);
    return () => {
      ro.disconnect();
      window.clearTimeout(stop);
    };
  }, []);
  return (
    <div ref={ref} className="mt-1 border-t border-[color:var(--m-border)]" style={{ scrollMarginBottom: BOTTOM_BARS }}>
      {children}
    </div>
  );
}

function FillCards() {
  const { displayNetworkName, address } = useMarketPageContext();
  const { tradeHistories, tradeHistoriesTotalPages, tradeHistoriesPage, setTradeHistoriesPage, isTradeHistoriesLoading } =
    useOrderPageContext();
  const views = useMemo(
    () => toFillViews(tradeHistories ?? [], address, displayNetworkName),
    [tradeHistories, address, displayNetworkName],
  );
  // One batched lookup for the whole list — see TradeHistory.
  const identities = useIdentities(
    displayNetworkName,
    useMemo(() => counterpartyAddresses(views.map((v) => v.counterparty)), [views]),
  );
  const expanded = useExpanded();
  return (
    <>
      {views.length === 0 ? (
        <Empty text={isTradeHistoriesLoading ? "Loading…" : "No fills yet"} />
      ) : (
        views.map((v) => (
          <Card key={v.key} testId="fill-card">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-[13px]">
                <Side side={v.side} />{" "}
                <span className="font-mono text-[11px] text-[color:var(--m-text-secondary)]">
                  · {v.role} · {v.pairSymbol} · {v.when}
                </span>
              </div>
              {v.counterparty.kind === "none" ? null : (
                // Sized here: the card sets no font size, so a lone wallet
                // inherited the page's 16px mono and spilled past the header.
                <span data-testid="fill-card-counterparty" className="flex min-w-0 max-w-[45%] justify-end text-[11px]">
                  <CounterpartySummary
                    view={v.counterparty}
                    open={expanded.isOpen(v.key)}
                    onToggle={() => expanded.toggle(v.key)}
                    networkName={displayNetworkName}
                    nameOf={identities.nameOf}
                  />
                </span>
              )}
            </div>
            {/* Full width under the header: opened in place, the list would
                push the side and pair off the header's one line. */}
            {v.counterparty.kind === "many" && expanded.isOpen(v.key) ? (
              <CounterpartyList
                view={v.counterparty}
                networkName={displayNetworkName}
                nameOf={identities.nameOf}
                className="mt-1.5 border-t border-[color:var(--m-border)] pt-1.5"
              />
            ) : null}
            <div className="mt-1.5 flex justify-between font-mono text-[12.5px] tabular-nums">
              <span>{v.executed}</span>
              <span>@ {v.price}</span>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
              <span>
                {v.total} · <span title={v.feeTitle}>fee {v.fee}</span>
              </span>
              <TxLink href={v.tx} />
            </div>
          </Card>
        ))
      )}
      <Pager page={tradeHistoriesPage} totalPages={tradeHistoriesTotalPages} onPage={setTradeHistoriesPage} />
    </>
  );
}
