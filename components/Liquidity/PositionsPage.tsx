"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAccount } from "wagmi";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";
import { useLpPositions, useManagerTx } from "@/hooks/useLpPositions";
import { pinnedPosition, type LpToken } from "@/lib/liquidity/positions";
import { PositionCard } from "./PositionCard";
import { WithdrawFlow } from "./WithdrawFlow";
import { AdjustFlow } from "./AdjustFlow";

type PositionFilter = "open" | "closed";

/**
 * /pool -- the wallet's LP positions, ONE CARD PER TOKEN.
 *
 * apps/web/CLAUDE.md's LP section is the rule: one LP token is one position holding the
 * whole band ladder, so a card is a token and its bands are drawn inside it. The count
 * of cards is the count of tokens; a wallet with two positions in one pair sees two.
 */
export function PositionsPage({ networkSlug }: { networkSlug: string }) {
  const { displayNetworkName } = useMarketPageContext();
  const { address, isConnected, isLoading: walletLoading } = useWalletAccount();
  const { address: signer } = useAccount();
  const { open } = useWalletConnect();
  const { data: tokens, isLoading, refetch } = useLpPositions(displayNetworkName, address);
  const { send } = useManagerTx(displayNetworkName);
  const [filter, setFilter] = useState<PositionFilter>("open");
  const [query, setQuery] = useState("");
  const [collecting, setCollecting] = useState<string | null>(null);

  /*
   * Seeded from the URL so the portfolio can link straight INTO a dialog. `position`
   * names the token; a bare pair still works when the wallet holds exactly one
   * position in it. Read once, as initial state, so closing the dialog sticks.
   */
  const params = useSearchParams();
  const [withdrawing, setWithdrawing] = useState<string | null>(() =>
    params.get("withdraw") === "1" ? (params.get("position") ?? `pair:${params.get("base")}/${params.get("quote")}`) : null,
  );
  const [adjusting, setAdjusting] = useState<string | null>(null);

  const find = (key: string | null): LpToken | undefined => {
    if (!key || !tokens) return undefined;
    if (key.startsWith("pair:")) {
      const matches = tokens.filter((t) => t.active && `pair:${t.baseSymbol}/${t.quoteSymbol}` === key);
      return matches.length === 1 ? matches[0] : undefined;
    }
    return tokens.find((t) => t.tokenId === key);
  };

  const shown = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return (tokens ?? []).filter(
      (t) =>
        (filter === "open" ? t.active : !t.active) &&
        (!needle || `${t.baseSymbol}/${t.quoteSymbol}`.toUpperCase().includes(needle) || t.tokenId === needle.replace("#", "")),
    );
  }, [tokens, filter, query]);

  const collect = async (token: LpToken) => {
    if (!signer) return;
    setCollecting(token.tokenId);
    const sent = await send("collect", [BigInt(token.tokenId), signer], "Could not collect fees");
    setCollecting(null);
    // Refetch for an unconfirmed send as well — it may already have landed.
    if (sent) void refetch();
  };

  /**
   * The position each dialog OPENED with, kept even when the live list stops
   * matching it.
   *
   * `find` re-resolves from `tokens` on every render, and `tokens` moves under
   * an open dialog: the withdrawal refetches it, `useLpPositions` invalidates
   * again on the receipt, a full exit flips `active` to false, and a `pair:`
   * deep link stops matching the moment the wallet holds a second position in
   * that pair. Any one of those makes `find` return undefined — which UNMOUNTS
   * the dialog and destroys the success screen the withdrawal has just put on
   * screen. The user sees their confirmation vanish, and a full withdrawal
   * could never show one at all, because closing the position is exactly what
   * removes it from the list.
   *
   * The live row still wins while it exists, so an open dialog goes on showing
   * fresh numbers; the pin is only what stops it disappearing.
   */
  const opened = useRef(new Map<string, LpToken>());
  const resolve = (key: string | null): LpToken | undefined => {
    if (!key) return undefined;
    const live = find(key);
    if (live) opened.current.set(key, live);
    return pinnedPosition(live, opened.current.get(key));
  };

  const withdrawToken = resolve(withdrawing);
  const adjustToken = resolve(adjusting);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-5 pb-24 pt-12 min-[800px]:px-8">
      <header className="mb-8 flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-[32px] font-medium tracking-[-0.035em] text-[var(--m-text-primary)] [text-wrap:balance]">Positions</h1>
          <p className="mt-1.5 text-sm text-[var(--m-text-secondary)]">
            One card per position. Each holds its whole band ladder on {displayNetworkName}.
          </p>
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
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm capitalize",
                filter === value ? "bg-[var(--m-surface)] font-medium text-[var(--m-text-primary)] shadow-sm" : "text-[var(--m-text-secondary)]",
              )}
            >
              {value} positions
            </button>
          ))}
        </div>
        <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface)] px-3.5 text-[var(--m-text-secondary)]">
          <Search className="h-4 w-4" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by pair or #id"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--m-text-primary)] outline-none"
          />
        </label>
      </div>

      {!walletLoading && !isConnected ? (
        <EmptyState title="Connect a wallet to view your positions" body="Your active and closed liquidity positions will appear here." action="Connect wallet" onAction={open} />
      ) : isLoading || walletLoading ? (
        <div className="grid gap-3">
          <PositionSkeleton />
          <PositionSkeleton />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === "closed" ? "No closed positions" : query ? "No positions found" : "Your active liquidity positions will appear here"}
          body={filter === "closed" ? "Positions you fully withdraw are kept here with their realised P&L and fees." : "Create a position to earn fees from trades that use your liquidity."}
          action={filter === "open" && !query ? "New position" : undefined}
          href={filter === "open" && !query ? buildPageUrl("pool", { slug: networkSlug, provide: true }) : undefined}
        />
      ) : (
        <div className="grid gap-3" data-testid="lp-positions">
          {shown.map((token) => (
            <PositionCard
              key={token.tokenId}
              token={token}
              addHref={buildPageUrl("pool", {
                slug: networkSlug,
                deposit: true,
                base: token.baseSymbol,
                quote: token.quoteSymbol,
                positionId: token.tokenId,
              })}
              onWithdraw={() => setWithdrawing(token.tokenId)}
              onAdjust={() => setAdjusting(token.tokenId)}
              onCollect={() => void collect(token)}
              collecting={collecting === token.tokenId}
            />
          ))}
        </div>
      )}

      {withdrawToken && (
        <WithdrawFlow token={withdrawToken} onClose={() => setWithdrawing(null)} onWithdrawn={() => void refetch()} />
      )}
      {adjustToken && <AdjustFlow token={adjustToken} onClose={() => setAdjusting(null)} onAdjusted={() => void refetch()} />}
    </div>
  );
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
