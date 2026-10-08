import type { ReactNode } from "react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { chainColor, chainShort, tokenColor } from "@/lib/portfolio/mock";
import { formatUsd } from "@/utils/number";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";

/**
 * Shared presentational bits for the cross-chain portfolio, ported from the
 * approved artifact. Colors resolve to Monet `--m-*` tokens (light + dark) with
 * per-chain / per-token hues coming from the mock seam.
 */

/**
 * A USD figure, in the venue's canonical notation.
 *
 * This rounded to whole dollars and printed every digit — `Math.round(n)` plus
 * `toLocaleString`. Both halves were wrong, in opposite directions:
 *
 *  - **Below a dollar it invented money.** A realised PnL of $0.65 rendered as
 *    `+$1`. This venue's tokens trade in the 1e-5 range, so entire positions sit
 *    under a cent, and the same wallet's figure read `+$0.65` on the leaderboard
 *    (which goes through `signedMoney`) and `+$1` in the profile modal.
 *  - **Above a million it printed the lot.** `$3,988,108,251` in an 18px stat
 *    cell overflowed into the column beside it, which is how this was noticed.
 *
 * `formatUsd` is the single answer to both and already documents the rule —
 * subscript zeros below a dollar, compaction above a thousand. `signedMoney`
 * moved off this function for exactly these reasons and left a note saying so;
 * this finishes that migration for the seven components still calling it rather
 * than leaving two USD conventions in one app.
 */
export function money(n: number): string {
  return formatUsd(n);
}

function displayToken(value: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value;
}

export function TokenAvatar({
  symbol,
  logoURI,
  size = "sm",
}: {
  symbol: string;
  logoURI?: string;
  size?: "sm" | "md";
}) {
  return <TokenImageIcon symbol={symbol} logoURI={logoURI} color={tokenColor(symbol)} size={size} />;
}

/** One circular market mark split evenly between its base and quote tokens. */
export function MarketAvatar({ base, quote }: { base: string; quote: string }) {
  return (
    <span
      className="relative block h-5 w-5 shrink-0 overflow-hidden rounded-full"
      aria-label={`${displayToken(base)}/${displayToken(quote)}`}
    >
      <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
        <TokenImageIcon symbol={base} color={tokenColor(base)} className="h-5 w-5 rounded-none" />
      </span>
      <span className="absolute inset-y-0 left-1/2 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={quote}
          color={tokenColor(quote)}
          className="h-5 w-5 -translate-x-1/2 rounded-none"
        />
      </span>
    </span>
  );
}

/**
 * The `.cc` chain chip — mono outline pill carrying the chain's own MARK.
 *
 * It used to draw a coloured dot from `chainColor`, a per-name hash. That is a
 * fine tiebreaker between two chips side by side and a poor answer to "which
 * network is this", because the colour means nothing on its own — every chain
 * an operator had actually uploaded a mark for still rendered as an anonymous
 * dot. `useChainBrand` is the app's single source for that artwork (see the
 * chain-badge section in apps/web/CLAUDE.md); a chain with no upload falls back
 * to initials inside the same box, so the pill never collapses.
 *
 * The hashed colour stays on the TEXT and the border, where it still does its
 * one useful job of separating two chips at a glance.
 */
export function ChainChip({ network }: { network: string }) {
  const { data: chainBrands } = useChainBrand();
  const c = chainColor(network);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border py-px pl-1 pr-1.5 font-mono text-[9.5px] font-medium tabular-nums"
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}
    >
      <TokenImageIcon
        symbol={network}
        color={c}
        logoURI={chainIconFrom(chainBrands, network)}
        size="sm"
        badge={false}
        className="h-3 w-3"
      />
      {chainShort(network)}
    </span>
  );
}

type Tone = "primary" | "accent" | "success" | "logo" | "muted";

const TONE_VAR: Record<Exclude<Tone, "muted">, string> = {
  primary: "var(--m-primary)",
  accent: "var(--m-accent)",
  success: "var(--m-success)",
  logo: "var(--m-logo)",
};

/** Status pill with a leading dot; `muted` uses the neutral surface treatment. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const base =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold";
  if (tone === "muted") {
    return (
      <span
        className={base}
        style={{ backgroundColor: "var(--m-surface-2)", color: "var(--m-text-secondary-2)" }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--m-text-secondary-2)" }}
        />
        {children}
      </span>
    );
  }
  const v = TONE_VAR[tone];
  return (
    <span
      className={base}
      style={{ backgroundColor: `color-mix(in srgb, ${v} 16%, transparent)`, color: v }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: v }} />
      {children}
    </span>
  );
}

export function SidePill({ side }: { side: "Buy" | "Sell" }) {
  const v = side === "Buy" ? "var(--m-success)" : "var(--m-error)";
  return (
    <span
      className="inline-flex rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${v} 14%, transparent)`, color: v }}
    >
      {side}
    </span>
  );
}

// Capped short of full, as FillRing is: a row here is an order the chain has not
// cleared, and a full bar reads as "done".
const FILL_BAR_MAX = 97;

export function FillBar({ pct }: { pct: number }) {
  return (
    <span
      className="ml-1.5 inline-block h-[5px] w-14 overflow-hidden rounded-[3px] align-middle"
      style={{ backgroundColor: "var(--m-surface-2)" }}
    >
      <span
        className="block h-full"
        style={{ width: `${Math.max(0, Math.min(pct, FILL_BAR_MAX))}%`, backgroundColor: "var(--m-primary)" }}
      />
    </span>
  );
}

export function SwapTag() {
  return (
    <span
      className="rounded-[5px] border px-1.5 py-px font-mono text-[9.5px]"
      style={{ color: "var(--m-logo)", borderColor: "var(--m-logo)" }}
    >
      from swap
    </span>
  );
}

/** Market identity cell — avatar + base/quote + chain chip, with optional sub-line. */
export function MarketCell({
  base,
  quote,
  network,
  sub,
}: {
  base: string;
  quote: string;
  network: string;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <MarketAvatar base={base} quote={quote} />
      <div className="flex min-w-0 flex-col leading-tight">
        <b className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
          <span className="min-w-0 truncate" title={`${base}/${quote}`}>
            {displayToken(base)}/{displayToken(quote)}
          </span>
          <ChainChip network={network} />
        </b>
        {sub ? (
          <span className="text-[10.5px]" style={{ color: "var(--m-text-secondary-2)" }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* Shared table cell classes (right-aligned numeric grid, first col left). */
export const TH =
  "border-b border-[color:var(--m-border)] px-3.5 py-2.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)] first:text-left";
export const TD =
  "border-b border-[color:var(--m-border)] px-3.5 py-2.5 text-right align-middle first:text-left";
export const NUM = "font-mono tabular-nums";
