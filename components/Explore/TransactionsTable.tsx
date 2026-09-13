"use client";

import { AggregatorLink } from "@/consts";
import { useEffect, useState } from "react";
import { ChainBadge, TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import type { SpotTrade, SpotTradeEvent } from "@/types";
import { cn } from "@/lib/utils";
import { eventBus } from "@/utils/events";
import { useAggregatorChains } from "@/lib/chains/useVisibleChains";

function shortAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
}

function amount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) return "<0.01";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function TokenAmount({ symbol, value, logoURI, chainName }: { symbol: string; value: number; logoURI?: string; chainName: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
      {amount(value)} {symbol}
      <span className="relative inline-flex h-6 w-6 shrink-0">
        <TokenImageIcon symbol={symbol} logoURI={logoURI} color="var(--m-primary)" size="sm" />
        <span className="absolute -bottom-1 -right-1">
          <ChainBadge chainName={chainName} size="sm" />
        </span>
      </span>
    </span>
  );
}

export function TransactionsTable({
  search = "",
  chainFilter = null,
}: {
  search?: string;
  /**
   * The chain the switcher above is scoped to, or null for all chains.
   *
   * Required because this tab became cross-chain on 2026-09-04 and nothing was
   * ever told: it reads every chain's fills from the aggregator, and the
   * `ChainSwitcher` beside it kept offering Arc / RISE / All while this list
   * ignored the choice entirely. Selecting "Arc Testnet" showed RISE swaps, each
   * correctly badged RISE — the rows were honest and the filter was a lie.
   */
  chainFilter?: string | null;
}) {
  const { displayNetworkName } = useMarketPageContext();
  const [trades, setTrades] = useState<SpotTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  // Hidden chains must not contribute fills to a cross-chain tape.
  const chains = useAggregatorChains();
  const chainsKey = chains.join(",");

  useEffect(() => setMounted(true), []);

  /**
   * Every chain's transactions, newest first, from the aggregator.
   *
   * This read `getSpotRecentOverallTrades(displayNetworkName, ...)` until
   * 2026-09-04 — one chain's fills under a heading that names none, on a page
   * whose other four tabs were already cross-chain. Ordering across chains has
   * to be on the unix timestamp and never a block number, which is per-chain and
   * cannot be compared; the aggregator does that (`tradeSortKey`).
   *
   * A failed fetch empties the list rather than throwing: this is a directory
   * tab, and the surrounding page must survive a service being down.
   */
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    fetch(
      `${AggregatorLink}/api/trades/all/30/1${chainsKey ? `?chains=${encodeURIComponent(chainsKey)}` : ""}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((body: { trades?: (SpotTrade & { chain?: string })[] }) => {
        if (!disposed) setTrades(Array.isArray(body.trades) ? body.trades : []);
      })
      .catch(() => {
        if (!disposed) setTrades([]);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [chainsKey]);

  useEffect(() => {
    const onTrade = (event: SpotTradeEvent) => {
      const next = {
        ...event,
        base: { id: event.base, symbol: event.baseSymbol, logoURI: event.baseLogoURI } as SpotTrade["base"],
        quote: { id: event.quote, symbol: event.quoteSymbol, logoURI: event.quoteLogoURI } as SpotTrade["quote"],
        asset: { id: event.asset, symbol: event.assetSymbol } as SpotTrade["asset"],
        // Stamped with the socket's own chain. `MarketPageProvider` opens ONE
        // public socket, for `displayNetworkName`, so every event arriving here
        // is that chain's — and without saying so a live fill would carry no
        // `chain` at all, which means no badge and no way for the filter below
        // to place it. The fetched rows all carry one; these have to match.
        chain: displayNetworkName,
      } as SpotTrade;
      setTrades((current) => [next, ...current.filter((trade) => trade.txHash !== next.txHash)].slice(0, 30));
    };
    // MarketPageProvider already owns the public socket, so this table does not open another connection.
    eventBus.on("spot-recent-overall-trades-update", onTrade);
    return () => {
      eventBus.off("spot-recent-overall-trades-update", onTrade);
    };
  }, []);

  const visibleTrades = trades.filter((trade) => {
    // Scope first: a search inside the wrong chain's rows is still the wrong
    // rows. A trade with no chain is kept only when nothing is being filtered —
    // it cannot be shown to belong to the selected one.
    if (chainFilter) {
      const chain = (trade as SpotTrade & { chain?: string }).chain;
      if (chain !== chainFilter) return false;
    }
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [
      trade.base?.symbol,
      trade.quote?.symbol,
      trade.account,
      trade.txHash,
    ].some((value) => value?.toLowerCase().includes(needle));
  });

  return (
    <div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[15px]">
        <thead>
          <tr className="bg-[color:var(--m-surface-2)] text-left">
            {[
              ["Time", "text-left"],
              ["Type", "text-left"],
              ["USD", "text-right"],
              ["Token amount", "text-right"],
              ["Token amount", "text-right"],
              ["Wallet", "text-right"],
            ].map(([label, align], index) => (
              <th key={`${label}-${index}`} className={cn("px-4 py-4 text-sm font-normal text-[color:var(--m-text-secondary)]", align, index === 0 && "rounded-l-2xl pl-4", index === 5 && "rounded-r-2xl")}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleTrades.map((trade, index) => {
            const base = trade.base;
            const quote = trade.quote;
            return (
              <tr key={`${trade.txHash}-${index}`} className={cn("group border-b border-[color:var(--m-border)]/45 transition-colors hover:bg-[color:var(--m-surface-2)]", index === 4 && "bg-[color:var(--m-surface-2)]/65") }>
                <td className="whitespace-nowrap px-4 py-5 font-dm-mono text-base tabular-nums text-[color:var(--m-text-primary)]">{mounted ? timeAgo(trade.timestamp) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-5 text-left text-[color:var(--m-text-secondary)]"><span>Swap</span> <b className="font-medium text-[color:var(--m-text-primary)]">{base.symbol}</b> for <b className="font-medium text-[color:var(--m-text-primary)]">{quote.symbol}</b></td>
                <td className="whitespace-nowrap px-4 py-5 text-right font-dm-mono text-base tabular-nums text-[color:var(--m-text-primary)]">${trade.valueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-5 text-right font-dm-mono text-base tabular-nums text-[color:var(--m-text-primary)]"><TokenAmount symbol={base.symbol} value={trade.baseAmount} logoURI={base.logoURI} chainName={(trade as SpotTrade & { chain?: string }).chain ?? displayNetworkName} /></td>
                <td className="px-4 py-5 text-right font-dm-mono text-base tabular-nums text-[color:var(--m-text-primary)]"><TokenAmount symbol={quote.symbol} value={trade.quoteAmount} logoURI={quote.logoURI} chainName={(trade as SpotTrade & { chain?: string }).chain ?? displayNetworkName} /></td>
                <td className="whitespace-nowrap px-4 py-5 text-right font-dm-mono text-base tabular-nums text-[color:var(--m-text-primary)]">{shortAddress(trade.account)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {loading && <p className="py-8 text-center text-sm text-[color:var(--m-text-secondary)]">Loading transactions…</p>}
      {!loading && visibleTrades.length === 0 && <p className="py-8 text-center text-sm text-[color:var(--m-text-secondary)]">{trades.length === 0
            ? "No transactions on any chain yet."
            : chainFilter
              ? `No transactions on ${chainFilter} match your search.`
              : "No transactions match your search."}</p>}
    </div>
  );
}
