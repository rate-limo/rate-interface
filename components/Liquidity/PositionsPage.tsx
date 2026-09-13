"use client";

import Link from "next/link";
import { formatPct } from "@/lib/pair/derive";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { usePortfolioLive } from "@/hooks/usePortfolioLive";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";
import { cn } from "@/lib/utils";

type PositionFilter = "open" | "closed";

export function PositionsPage({ networkSlug }: { networkSlug: string }) {
  const { displayNetworkName } = useMarketPageContext();
  const { address, isConnected, isLoading: walletLoading } = useWalletAccount();
  const { open } = useWalletConnect();
  const { data, isLoading } = usePortfolioLive(displayNetworkName, address);
  const [filter, setFilter] = useState<PositionFilter>("open");
  const [query, setQuery] = useState("");

  const positions = useMemo(() => {
    const needle = query.trim().toUpperCase();
    if (filter === "closed") return [];
    return (data?.lps ?? []).filter((position) =>
      !needle || `${position.market.base}/${position.market.quote}`.includes(needle),
    );
  }, [data?.lps, filter, query]);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-5 pb-24 pt-12 min-[800px]:px-8">
      <header className="mb-8 flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-[32px] font-medium tracking-[-0.035em] text-[var(--m-text-primary)]">Positions</h1>
          <p className="mt-1.5 text-sm text-[var(--m-text-secondary)]">Manage liquidity positions you own on {displayNetworkName}.</p>
        </div>
        <Link
          href={buildPageUrl("pool", { slug: networkSlug, provide: true })}
          className="ml-auto inline-flex h-12 items-center rounded-2xl bg-[var(--m-primary)] px-5 text-[15px] font-semibold text-[var(--m-on-primary)] transition-colors hover:bg-[var(--m-primary-hover)]"
        >
          + New position
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-[var(--m-surface-2)] p-1">
          {(["open", "closed"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={cn("rounded-lg px-4 py-2 text-sm capitalize", filter === value ? "bg-[var(--m-surface)] font-medium text-[var(--m-text-primary)] shadow-sm" : "text-[var(--m-text-secondary)]")}>
              {value} positions
            </button>
          ))}
        </div>
        <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface)] px-3.5 text-[var(--m-text-secondary)]">
          <Search className="h-4 w-4" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search positions" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--m-text-primary)] outline-none" />
        </label>
        <button type="button" aria-label="Position filters" className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--m-border)] bg-[var(--m-surface)] text-[var(--m-text-secondary)]">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {!walletLoading && !isConnected ? (
        <EmptyState title="Connect a wallet to view your positions" body="Your active and closed liquidity positions will appear here." action="Connect wallet" onAction={open} />
      ) : isLoading || walletLoading ? (
        <div className="grid gap-3"><PositionSkeleton /><PositionSkeleton /></div>
      ) : positions.length === 0 ? (
        <EmptyState
          title={filter === "closed" ? "No closed positions" : query ? "No positions found" : "Your active liquidity positions will appear here"}
          body={filter === "closed" ? "Positions you withdraw will be recorded here when position history is indexed." : "Create a position to earn fees from trades that use your liquidity."}
          action={filter === "open" && !query ? "New position" : undefined}
          href={filter === "open" && !query ? buildPageUrl("pool", { slug: networkSlug, provide: true }) : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {positions.map((position, index) => (
            <Link key={`${position.market.base}-${position.market.quote}-${index}`} href={buildPageUrl("pool", { slug: networkSlug, deposit: true, base: position.market.base, quote: position.market.quote })} className="group rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5 transition-colors hover:border-[var(--m-primary-300)]">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex -space-x-2">
                  {[position.market.base, position.market.quote].map((symbol) => <TokenImageIcon key={symbol} symbol={symbol} color={tokenColor(symbol)} size="md" className="h-9 w-9 border-2 border-[var(--m-surface)]" />)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-semibold text-[var(--m-text-primary)]">{position.market.base} / {position.market.quote}</h2>
                    <span className={cn("rounded-md px-2 py-0.5 font-mono text-[10px]", position.inRange ? "bg-[color:color-mix(in_srgb,var(--m-success)_14%,transparent)] text-[var(--m-success-fg)]" : "bg-[var(--m-surface-2)] text-[var(--m-text-secondary)]")}>{position.inRange ? "In range" : "Out of range"}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--m-text-secondary)]">{position.singleSided ? "Single-sided liquidity" : "Concentrated range"} · {position.market.network}</p>
                </div>
                <div className="ml-auto grid grid-cols-3 gap-8 text-right">
                  <Metric label="Position" value={position.provided} />
                  <Metric label="APR" value={position.aprPct === null ? "—" : `~${formatPct(position.aprPct)}`} />
                  <Metric label="Fees earned" value={position.feesEarnedUsd === null ? "—" : `$${position.feesEarnedUsd.toFixed(2)}`} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="font-mono text-[10px] uppercase tracking-wide text-[var(--m-text-secondary-2)]">{label}</div><div className="mt-1 font-mono text-[13px] tabular-nums text-[var(--m-text-primary)]">{value}</div></div>;
}

function EmptyState({ title, body, action, onAction, href }: { title: string; body: string; action?: string; onAction?: () => void; href?: string }) {
  const buttonClass = "mt-6 inline-flex h-11 items-center rounded-xl bg-[var(--m-primary)] px-5 text-sm font-semibold text-[var(--m-on-primary)]";
  return <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] px-6 text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--m-surface-2)] text-2xl text-[var(--m-primary)]">◇</div><h2 className="text-lg font-semibold text-[var(--m-text-primary)]">{title}</h2><p className="mt-2 max-w-md text-sm text-[var(--m-text-secondary)]">{body}</p>{action && (href ? <Link href={href} className={buttonClass}>{action}</Link> : <button type="button" onClick={onAction} className={buttonClass}>{action}</button>)}</div>;
}

/**
 * Mirrors the position row above, element for element.
 *
 * It used to be one flat `h-[104px]` box, which is a placeholder for a card rather than
 * for THIS card: nothing stood where the token pair, the title, the range badge or the
 * three metrics land, so the whole row reflowed the moment data arrived. The height was
 * wrong too — `p-5` around a 36px icon cluster comes out near 84px, not 104.
 *
 * The wrapper deliberately repeats the row's own classes (`rounded-2xl border p-5`, the
 * same `flex flex-wrap items-start gap-4`, the same `ml-auto grid grid-cols-3 gap-8`)
 * instead of approximating them, so the skeleton's height is DERIVED from the same box
 * model the real row uses and cannot drift from it by a hardcoded pixel value again.
 */
/**
 * Mirrors the position row above, element for element.
 *
 * It used to be one flat `h-[104px]` box: a placeholder for a card in general rather than
 * for THIS card. Nothing stood where the token pair, the title, the range badge or the
 * three metrics land, so the whole row reflowed the moment data arrived — and the height
 * was wrong on top of that. Measured in the browser: the real row is **87.5px**, so the
 * old skeleton was 16.5px too tall.
 *
 * ## The heights are derived, not typed in
 *
 * Every text placeholder is the SAME ELEMENT with the SAME type classes as the real row,
 * rendered with `text-transparent` and the shimmer as its own background. So the line
 * boxes are computed by the browser from the same font-size/leading the real row uses,
 * and the skeleton measures 87.5px because the row does — not because someone copied a
 * number across. Change the row's type scale and this follows it.
 *
 * That is why the placeholder strings are real words rather than `&nbsp;` runs: their
 * length is what gives each bar a plausible width, and a token pair, a range badge and a
 * "Concentrated range · Network" subtitle are the actual shapes being waited on.
 */
function PositionSkeleton() {
  const bar = "animate-pulse rounded bg-[var(--m-surface-2)] motion-reduce:animate-none";
  return (
    <div
      role="status"
      aria-label="Loading position"
      className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5"
    >
      <div className="flex flex-wrap items-start gap-4" aria-hidden>
        {/* The overlap and the surface-coloured ring are what make two circles read as a
            PAIR rather than as two icons, so the placeholder carries both. */}
        <div className="flex -space-x-2">
          <div className={cn(bar, "h-9 w-9 rounded-full border-2 border-[var(--m-surface)]")} />
          <div className={cn(bar, "h-9 w-9 rounded-full border-2 border-[var(--m-surface)]")} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className={cn(bar, "text-[17px] font-semibold text-transparent")}>ETH / USDC</h2>
            <span className={cn(bar, "rounded-md px-2 py-0.5 font-mono text-[10px] text-transparent")}>
              In range
            </span>
          </div>
          <p className={cn(bar, "mt-1 text-xs text-transparent")}>Concentrated range · Network</p>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-8 text-right">
          {["Position", "APR", "Fees earned"].map((label) => (
            <div key={label}>
              <div className={cn(bar, "font-mono text-[10px] uppercase tracking-wide text-transparent")}>
                {label}
              </div>
              <div className={cn(bar, "mt-1 font-mono text-[13px] tabular-nums text-transparent")}>0.00</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
