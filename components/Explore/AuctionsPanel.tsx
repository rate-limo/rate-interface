"use client";

import { AggregatorLink } from "@/consts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldCheck } from "lucide-react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";
import { cn } from "@/lib/utils";
import { useAggregatorChains } from "@/lib/chains/useVisibleChains";

interface Auction {
  id: string;
  presaleId: string;
  coin: string;
  name: string | null;
  symbol: string | null;
  logoURI: string | null;
  decimals: number | null;
  quoteSymbol: string | null;
  quoteDecimals: number | null;
  totalSupply: string;
  priceQuotePerToken: string;
  targetRaise: string;
  totalCommitted: string;
  startAt: number;
  endAt: number;
  status: string;
  verified: boolean;
}

const amount = (raw: string, decimals: number | null) =>
  Number(raw) / 10 ** (decimals ?? 18);
const compact = (value: number, symbol = "") => {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${symbol ? ` ${symbol}` : ""}`;
};
const progress = (auction: Auction) => {
  const target = amount(auction.targetRaise, auction.quoteDecimals);
  const committed = amount(auction.totalCommitted, auction.quoteDecimals);
  return target > 0
    ? Math.min(100, Math.max(0, (committed / target) * 100))
    : 0;
};
const fdv = (auction: Auction) =>
  amount(auction.totalSupply, auction.decimals) *
  (Number(auction.priceQuotePerToken) / 10 ** (auction.quoteDecimals ?? 18));

function remaining(endAt: number, now: number | null) {
  if (now === null) return "—";
  const seconds = Math.max(0, endAt - now);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function AuctionSkeleton() {
  const pulse =
    "animate-pulse rounded-md bg-[var(--m-surface-2)] motion-reduce:animate-none";
  return (
    <div role="status" aria-label="Loading auctions" className="space-y-10">
      <section aria-hidden>
        <div className={cn(pulse, "mb-4 h-6 w-48")} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-52 rounded-2xl border border-[var(--m-border)] p-5"
            >
              <div className="flex items-center gap-3">
                <div className={cn(pulse, "h-10 w-10 rounded-full")} />
                <div className="space-y-2">
                  <div className={cn(pulse, "h-4 w-28")} />
                  <div className={cn(pulse, "h-3 w-14")} />
                </div>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-4">
                <div className={cn(pulse, "h-10 w-24")} />
                <div className={cn(pulse, "h-10 w-24")} />
              </div>
              <div className={cn(pulse, "mt-7 h-1.5 w-full rounded-full")} />
            </div>
          ))}
        </div>
      </section>
      <section aria-hidden>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className={cn(pulse, "h-6 w-32")} />
            <div className={cn(pulse, "h-3 w-56")} />
          </div>
          <div className="flex gap-2">
            <div className={cn(pulse, "h-10 w-32 rounded-xl")} />
            <div className={cn(pulse, "h-10 w-48 rounded-xl")} />
            <div className={cn(pulse, "h-10 w-36 rounded-xl")} />
          </div>
        </div>
        <div className="border-b border-[var(--m-border)] py-3">
          <div className={cn(pulse, "h-3 w-full")} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="grid min-h-16 grid-cols-[minmax(190px,1fr)_repeat(2,minmax(100px,.6fr))_240px_120px] items-center gap-4 border-b border-[var(--m-border)]/60"
          >
            <div className="flex items-center gap-3">
              <div className={cn(pulse, "h-8 w-8 rounded-full")} />
              <div className={cn(pulse, "h-4 w-24")} />
            </div>
            <div className={cn(pulse, "ml-auto h-3 w-20")} />
            <div className={cn(pulse, "ml-auto h-3 w-16")} />
            <div className={cn(pulse, "h-1.5 w-full rounded-full")} />
            <div className={cn(pulse, "ml-auto h-3 w-16")} />
          </div>
        ))}
      </section>
    </div>
  );
}

function VerifiedCard({
  auction,
  now,
  index,
  networkSlug,
}: {
  auction: Auction;
  now: number | null;
  index: number;
  networkSlug: string;
}) {
  const symbol = auction.symbol ?? "—";
  const pct = progress(auction);
  const tones = ["var(--m-primary)", "var(--m-success)", "var(--m-warning)"];
  const tone = tones[index % tones.length];
  return (
    <Link
      href={`/explore/auctions/${encodeURIComponent(auction.presaleId)}?chain=${encodeURIComponent(networkSlug)}`}
      className="group relative overflow-hidden rounded-2xl border border-[var(--m-border)] p-5 transition-transform hover:-translate-y-0.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${tone} 6%, var(--m-surface))`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[.09]"
        style={{
          backgroundImage: `radial-gradient(${tone} 1px, transparent 1px)`,
          backgroundSize: "14px 14px",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-3">
          <TokenImageIcon
            symbol={symbol}
            logoURI={auction.logoURI ?? undefined}
            color={tokenColor(symbol)}
            size="lg"
          />
          <div className="min-w-0">
            <span className="flex items-center gap-2">
              <b className="truncate text-lg">{auction.name || symbol}</b>
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-[var(--m-primary-fg)]"
                aria-label="Verified auction"
              />
            </span>
            <span className="font-dm-mono text-xs text-[var(--m-text-secondary)]">
              {symbol}
            </span>
          </div>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-4">
          <Metric
            label="FDV at floor"
            value={compact(fdv(auction), auction.quoteSymbol ?? "")}
          />
          <Metric
            label="Bid volume"
            value={compact(
              amount(auction.totalCommitted, auction.quoteDecimals),
              auction.quoteSymbol ?? "",
            )}
          />
        </div>
        <div className="mt-6 border-t border-[var(--m-border)] pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--m-text-secondary)]">
              Launch threshold
            </span>
            <b className="font-dm-mono">{Math.round(pct)}%</b>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--m-surface)]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: tone }}
            />
          </div>
          <div className="mt-3 flex justify-between font-dm-mono text-[10px] text-[var(--m-text-secondary)]">
            <span>
              {compact(
                amount(auction.targetRaise, auction.quoteDecimals),
                auction.quoteSymbol ?? "",
              )}
            </span>
            <span>{remaining(auction.endAt, now)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-[var(--m-text-secondary)]">
        {label}
      </span>
      <b className="mt-1 block font-dm-mono text-sm font-medium tabular-nums">
        {value}
      </b>
    </div>
  );
}

export function AuctionsPanel() {
  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext();
  // Hidden chains must not contribute auctions to a cross-chain list.
  const chainsKey = useAggregatorChains().join(",");
  const [now, setNow] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      30_000,
    );
    return () => window.clearInterval(id);
  }, []);
  /**
   * Every chain's auctions, from the aggregator.
   *
   * It read one chain through the same-origin `/api/gateway` proxy until
   * 2026-09-04 — the proxy existed because the Railway gateways refuse a browser
   * origin. The aggregator sets `cors({origin:"*"})` on every route, so this can
   * call it directly and no proxy is involved.
   *
   * Unlike the other four tabs this is NOT ranked: the gateway serves auctions
   * as a plain list with no paging, so the aggregator concatenates and tags each
   * row with its chain rather than inventing an order the single-chain view does
   * not have.
   */
  const query = useQuery({
    // Keyed on the chain set: hiding a chain must refetch, not serve a cached
    // page that still contains it.
    queryKey: ["aggregated-auctions", chainsKey],
    queryFn: async () => {
      const response = await fetch(
        `${AggregatorLink}/api/auctions${chainsKey ? `?chains=${encodeURIComponent(chainsKey)}` : ""}`,
      );
      if (!response.ok)
        throw new Error(`Auction request failed: ${response.status}`);
      return response.json() as Promise<{ auctions: Auction[] }>;
    },
  });
  const active = query.data?.auctions ?? [];
  const verified = active.filter((auction) => auction.verified).slice(0, 3);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? active.filter((auction) =>
          [auction.name, auction.symbol, auction.coin].some((value) =>
            value?.toLowerCase().includes(needle),
          ),
        )
      : active;
  }, [active, search]);

  if (query.isPending) return <AuctionSkeleton />;
  if (query.isError)
    return (
      <p className="py-10 text-center text-sm text-[var(--m-text-secondary)]">
        Could not reach the auction data source.
      </p>
    );

  return (
    <div className="space-y-10">
      <section aria-labelledby="verified-auctions">
        <div className="mb-4 flex items-center gap-2">
          <h2
            id="verified-auctions"
            className="text-xl font-medium tracking-[-.025em]"
          >
            Top verified auctions
          </h2>
          <span
            title="Selected by Rate operators"
            className="grid h-5 w-5 place-items-center rounded-full border border-[var(--m-border)] font-dm-mono text-[10px] text-[var(--m-text-secondary)]"
          >
            i
          </span>
        </div>
        {verified.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {verified.map((auction, index) => (
              <VerifiedCard
                key={auction.id}
                auction={auction}
                now={now}
                index={index}
                networkSlug={displayNetworkSlug}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--m-border)] px-5 py-8 text-sm text-[var(--m-text-secondary)]">
            No live auctions are verified by an operator yet.
          </div>
        )}
      </section>
      <section aria-labelledby="live-auctions">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="live-auctions"
              className="text-xl font-medium tracking-[-.025em]"
            >
              Live auctions
            </h2>
            <p className="mt-1 text-sm text-[var(--m-text-secondary)]">
              All auctions currently accepting bids, without curation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChainSwitcher />
            <label className="flex h-10 w-48 items-center gap-2 rounded-xl border border-[var(--m-border)] px-3 text-sm text-[var(--m-text-secondary)]">
              <Search className="h-4 w-4" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search auctions"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <Link
              href={`/create/auction?chain=${encodeURIComponent(displayNetworkSlug)}`}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--m-text-primary)] px-4 text-sm font-medium text-[var(--m-surface)]"
            >
              + Launch auction
            </Link>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--m-border)] py-10 text-center text-sm text-[var(--m-text-secondary)]">
            No live auctions on this chain.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--m-border)] text-left text-xs font-normal text-[var(--m-text-secondary)]">
                  <th className="py-3 pr-4 font-normal">Token</th>
                  <th className="py-3 pr-4 text-right font-normal">
                    FDV at floor
                  </th>
                  <th className="py-3 pr-4 text-right font-normal">
                    Bid volume
                  </th>
                  <th className="py-3 pr-4 font-normal">Launch threshold</th>
                  <th className="py-3 text-right font-normal">
                    Time remaining
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((auction) => {
                  const symbol = auction.symbol ?? "—";
                  const pct = progress(auction);
                  return (
                    <tr
                      key={auction.id}
                      className="border-b border-[var(--m-border)]/60"
                    >
                      <td className="py-4 pr-4">
                        <Link
                href={`/explore/auctions/${encodeURIComponent(auction.presaleId)}?chain=${encodeURIComponent(displayNetworkSlug)}`}
                          className="flex items-center gap-3"
                        >
                          <TokenImageIcon
                            symbol={symbol}
                            logoURI={auction.logoURI ?? undefined}
                            color={tokenColor(symbol)}
                            size="md"
                          />
                          <span>
                            <b className="block font-medium">
                              {auction.name || symbol}
                            </b>
                            <span className="font-dm-mono text-xs text-[var(--m-text-secondary)]">
                              {symbol}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-4 pr-4 text-right font-dm-mono text-sm tabular-nums">
                        {compact(fdv(auction), auction.quoteSymbol ?? "")}
                      </td>
                      <td className="py-4 pr-4 text-right font-dm-mono text-sm tabular-nums">
                        {compact(
                          amount(auction.totalCommitted, auction.quoteDecimals),
                          auction.quoteSymbol ?? "",
                        )}
                      </td>
                      <td className="w-[240px] py-4 pr-4">
                        <div className="flex justify-between font-dm-mono text-xs">
                          <span>
                            {compact(
                              amount(
                                auction.targetRaise,
                                auction.quoteDecimals,
                              ),
                              auction.quoteSymbol ?? "",
                            )}
                          </span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--m-surface-2)]">
                          <span
                            className="block h-full rounded-full bg-[var(--m-primary)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-4 text-right font-dm-mono text-sm tabular-nums">
                        {remaining(auction.endAt, now)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
