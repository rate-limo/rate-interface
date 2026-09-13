"use client";

import { useState } from "react";
import type { BalancesResult, ChainBalances, TokenBalance } from "@/lib/portfolio/types";
import { chainColor, chainShort } from "@/lib/portfolio/mock";
import { cn } from "@/lib/utils";
import { ChainChip, TokenAvatar, money } from "./parts";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";

/**
 * Demo overlay for the resilient balances panel. The mock hook only ever
 * resolves chains to `ok`/`loading`, so a presentation-only override lets the
 * panel demonstrate the `stale` / `error` degrade paths from the artifact —
 * still behind the mock seam, no real RPC. "live" defers to the hook.
 */
export type DemoState = "live" | "loading" | "stale-all" | "monad-failed";

const DEMOS: { key: DemoState; label: string }[] = [
  { key: "live", label: "Loaded" },
  { key: "loading", label: "Loading" },
  { key: "stale-all", label: "All stale" },
  { key: "monad-failed", label: "Monad failed" },
];

function applyDemo(chains: ChainBalances[], demo: DemoState): ChainBalances[] {
  return chains.map((c) => {
    if (demo === "loading") return { ...c, state: "loading" };
    if (demo === "stale-all") return { ...c, state: "stale", updatedAgo: "2m ago" };
    if (demo === "monad-failed")
      return c.slug === "monad-testnet"
        ? { ...c, state: "error", updatedAgo: "2m ago" }
        : c;
    return c;
  });
}

function sumTokens(tokens: TokenBalance[]): number {
  return tokens.reduce((t, tk) => t + tk.usdValue, 0);
}

export function AssetsPanel({
  balances,
  demo,
  setDemo,
  spinning,
  onRefresh,
  showDemoControl = true,
}: {
  balances: BalancesResult;
  demo: DemoState;
  setDemo: (d: DemoState) => void;
  spinning: boolean;
  onRefresh: () => void;
  showDemoControl?: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");

  const effective = applyDemo(balances.chains, demo);
  const shown = filter === "all" ? effective : effective.filter((c) => c.slug === filter);

  const anyLoading = shown.some((c) => c.state === "loading");
  const anyStale = shown.some((c) => c.state === "stale");
  const failed = shown.filter((c) => c.state === "error");
  const liveUsd = shown
    .filter((c) => c.state !== "error")
    .reduce((s, c) => s + sumTokens(c.tokens), 0);

  const retryChain = (network: string) => {
    setDemo("live");
    balances.refetchChain(network);
  };

  const totalLabel =
    "Total · " + (filter === "all" ? "wallet" : chainShort(shown[0]?.network ?? ""));

  let totalValue: string;
  let updatedNote: string;
  if (anyLoading) {
    totalValue = "…";
    updatedNote = "refreshing…";
  } else if (anyStale) {
    totalValue = money(liveUsd) + " · stale";
    updatedNote = "stale · 2m ago";
  } else if (failed.length > 0) {
    totalValue = money(liveUsd) + " +?";
    updatedNote = chainShort(failed[0].network) + " failed";
  } else {
    totalValue = money(liveUsd);
    updatedNote = "updated " + (shown[0]?.updatedAgo ?? "just now");
  }

  return (
    <div className="rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3.5">
        <h3 className="text-sm font-semibold text-[color:var(--m-text-primary)]">Assets</h3>
        <span className="ml-auto font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
          {updatedNote}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh balances"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[color:var(--m-border)] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
        >
          <span className={cn("inline-block", spinning && "animate-spin")}>↻</span>
        </button>
      </div>

      {/* chain filter */}
      <div className="flex gap-1.5 border-b border-[color:var(--m-border)] px-3 pb-2">
        <FilterButton on={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterButton>
        {balances.chains.map((c) => (
          <FilterButton
            key={c.slug}
            on={filter === c.slug}
            onClick={() => setFilter(c.slug)}
            network={c.network}
          >
            {chainShort(c.network)}
          </FilterButton>
        ))}
      </div>

      {/* rows */}
      <div className="p-1.5">
        {anyStale && (
          <Banner onRetry={onRefresh} retryLabel="Retry">
            Balances rate-limited on <b>all chains</b>. Showing values from <b>2m ago</b>.
          </Banner>
        )}
        {shown.map((c) => (
          <ChainRows key={c.slug} chain={c} onRetry={() => retryChain(c.network)} />
        ))}
      </div>

      {/* total */}
      <div className="flex items-center justify-between border-t border-[color:var(--m-border)] px-4 py-3 text-[12.5px] text-[color:var(--m-text-secondary)]">
        <span>{totalLabel}</span>
        <b className="font-mono text-sm tabular-nums text-[color:var(--m-text-primary)]">
          {totalValue}
        </b>
      </div>

      {showDemoControl && (
        <div className="border-t border-[color:var(--m-border)] px-4 py-3.5">
          <h4 className="mb-2.5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--m-accent)" }}
            />
            Demo · balance state
          </h4>
          <div className="flex flex-wrap gap-1">
            {DEMOS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDemo(d.key)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  demo === d.key
                    ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] text-[color:var(--m-primary)]"
                    : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  on,
  network,
  onClick,
  children,
}: {
  on: boolean;
  /** Full network name. Omitted by `All`, which is not a chain. */
  network?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { data: chainBrands } = useChainBrand();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
        on
          ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] text-[color:var(--m-primary)]"
          : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
      )}
    >
      {/* The chain's own mark, not a hashed dot — same reasoning as `ChainChip`.
          `All` passes no network and so carries no mark, which is correct: it
          is not a chain. */}
      {network && (
        <TokenImageIcon
          symbol={network}
          color={chainColor(network)}
          logoURI={chainIconFrom(chainBrands, network)}
          size="sm"
          badge={false}
          className="h-3.5 w-3.5"
        />
      )}
      {children}
    </button>
  );
}

function ChainRows({ chain, onRetry }: { chain: ChainBalances; onRetry: () => void }) {
  if (chain.state === "loading") {
    return (
      <>
        {chain.tokens.map((tk, i) => (
          <div key={`${tk.symbol}-${i}`} className="flex items-center gap-2.5 px-2.5 py-2.5">
            <Skel className="h-7 w-7 rounded-full" />
            <Skel className="h-3.5 w-16 rounded" />
            <Skel className="ml-auto h-3.5 w-14 rounded" />
          </div>
        ))}
      </>
    );
  }

  if (chain.state === "error") {
    return (
      <>
        <Banner onRetry={onRetry} retryLabel={`Retry ${chainShort(chain.network)}`}>
          <b>{chainShort(chain.network)}</b> RPC rate-limited — its balances are from{" "}
          <b>{chain.updatedAgo}</b>. Other chains stay live.
        </Banner>
        {chain.tokens.map((tk, i) => (
          <div
            key={`${tk.symbol}-${i}`}
            className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5"
          >
            <TokenAvatar symbol={tk.symbol} logoURI={tk.logoURI} size="md" />
            <div className="flex min-w-0 flex-col leading-tight">
              <b className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                {tk.symbol}
                <ChainChip network={chain.network} />
              </b>
              <span className="text-[10.5px] text-[color:var(--m-text-secondary-2)]">
                from {chain.updatedAgo}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[color:var(--m-text-secondary-2)]">—</span>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-[7px] border border-[color:var(--m-border)] px-2 py-[3px] text-[11px] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
              >
                ↻ retry
              </button>
            </div>
          </div>
        ))}
      </>
    );
  }

  // ok or stale
  const stale = chain.state === "stale";
  return (
    <>
      {chain.tokens.map((tk, i) => (
        <div
          key={`${tk.symbol}-${i}`}
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 hover:bg-[color:var(--m-surface-2)]",
            stale && "opacity-50"
          )}
        >
          <TokenAvatar symbol={tk.symbol} logoURI={tk.logoURI} size="md" />
          <div className="flex min-w-0 flex-col leading-tight">
            <b className="flex items-center gap-1.5 text-[13.5px] font-semibold">
              {tk.symbol}
              <ChainChip network={chain.network} />
            </b>
            <span className="text-[10.5px] text-[color:var(--m-text-secondary-2)]">
              {stale ? `from ${chain.updatedAgo}` : tk.name}
            </span>
          </div>
          <div className="ml-auto text-right">
            <div className="font-mono text-[13px] tabular-nums">{tk.amount}</div>
            <div className="font-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
              {money(tk.usdValue)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function Banner({
  children,
  onRetry,
  retryLabel,
}: {
  children: React.ReactNode;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div
      className="m-2.5 flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5 text-xs text-[color:var(--m-text-primary)]"
      style={{
        backgroundColor: "color-mix(in srgb, var(--m-accent) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--m-accent) 38%, transparent)",
      }}
    >
      <div className="flex items-start gap-2">
        <span className="font-bold" style={{ color: "var(--m-accent)" }}>
          ⚠
        </span>
        <div>{children}</div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-lg border border-[color:var(--m-primary)] px-2.5 py-1 text-[11.5px] text-[color:var(--m-primary)]"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function Skel({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block animate-pulse", className)}
      style={{ backgroundColor: "var(--m-surface-2)" }}
    />
  );
}
