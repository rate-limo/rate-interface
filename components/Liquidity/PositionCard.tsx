"use client";

/**
 * ONE card per LP TOKEN, with the whole band ladder inside it.
 *
 * apps/web/CLAUDE.md's LP section is the rule: a position is a token; its bands are its
 * distribution, drawn inside the card -- a bar split by value, then a row per band with
 * its live width, fee multiplier and share. Never a card per band.
 */

import Link from "next/link";
import { formatUnits } from "viem";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";
import { cn } from "@/lib/utils";
import type { LpToken } from "@/lib/liquidity/positions";

/** A band's ramp tint, tightest first -- the palette the on-chain card uses. */
const BAND_TINTS = ["#5F93D6", "#4F80BE", "#426FA7", "#375F90", "#2E517B", "#274567", "#213A56", "#1C3147"];

export function bandTint(band: number): string {
  return BAND_TINTS[Math.min(band, BAND_TINTS.length - 1)]!;
}

/** "±0.020%" from a fraction (0.0002), or "idle" when the limit cannot express it. */
export function formatBandWidth(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return "±—";
  if (fraction <= 0) return "idle";
  const pct = fraction * 100;
  return `±${pct < 0.01 ? pct.toPrecision(2) : pct.toFixed(3)}%`;
}

const usd = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const trim = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);
const amount = (v: bigint, decimals: number) => {
  const text = trim(formatUnits(v, decimals));
  const [whole, frac = ""] = text.split(".");
  return frac.length > 6 ? `${whole}.${frac.slice(0, 6)}` : text;
};

interface Props {
  token: LpToken;
  addHref: string;
  onWithdraw: () => void;
  onAdjust: () => void;
  onCollect: () => void;
  collecting: boolean;
}

export function PositionCard({ token, addHref, onWithdraw, onAdjust, onCollect, collecting }: Props) {
  const zero = BigInt(0);
  const claimable = token.claimableBase > zero || token.claimableQuote > zero;
  const vesting = token.vestingBase > zero || token.vestingQuote > zero;
  const pnl = token.unrealizedPnlUSD;

  return (
    <article
      className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5"
      data-testid="lp-position-card"
      data-token-id={token.tokenId}
    >
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex -space-x-2">
          {[token.baseSymbol, token.quoteSymbol].map((symbol) => (
            <TokenImageIcon key={symbol} symbol={symbol} color={tokenColor(symbol)} size="md" className="h-9 w-9 border-2 border-[var(--m-surface)]" />
          ))}
        </div>
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-[var(--m-text-primary)] [text-wrap:balance]">
            {token.baseSymbol} / {token.quoteSymbol}
          </h2>
          <p className="mt-0.5 font-mono text-[11.5px] text-[var(--m-text-secondary)]">
            #{token.tokenId} · {token.bands.length} band{token.bands.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-6 text-right">
          <Metric label="Value" value={usd(token.valueUSD)} />
          <Metric
            label="P&L"
            value={pnl === null ? "—" : `${pnl >= 0 ? "+" : "−"}${usd(Math.abs(pnl))}`}
            tone={pnl === null ? undefined : pnl >= 0 ? "up" : "down"}
          />
          <Metric label="Fees collected" value={usd(token.feesUSD)} />
        </div>
      </header>

      {/* The distribution: one bar, split by VALUE -- share counts are per band and
          cannot be compared. */}
      <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--m-surface-2)]" aria-hidden>
        {token.bands.map((b) => (
          <div key={b.band} style={{ width: `${b.sharePct}%`, background: bandTint(b.band) }} />
        ))}
      </div>

      <ul className="mt-3 grid gap-1.5" aria-label="Bands in this position">
        {token.bands.map((b) => (
          <li key={b.band} className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 font-mono text-[12px] tabular-nums">
            <span className="text-[var(--m-text-primary)]">B{b.band}</span>
            <span className="text-[var(--m-text-secondary)]">
              {formatBandWidth(b.toleranceBuy)}
              {b.feeMultiplier !== null && ` · ${trim(b.feeMultiplier.toFixed(2))}×`}
              {b.open === false && " · closed"}
            </span>
            <span className="text-[var(--m-text-secondary)]">{b.vestedPct === null ? "" : `${b.vestedPct.toFixed(0)}% vested`}</span>
            <span className="w-14 text-right text-[var(--m-text-primary)]">{b.sharePct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-2 rounded-xl bg-[var(--m-surface-2)] px-3.5 py-3 font-mono text-[12px] tabular-nums sm:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--m-text-secondary-2)]">Claimable</div>
          <div className="mt-0.5 text-[var(--m-success-fg)]">
            {token.live
              ? `${amount(token.claimableBase, token.baseDecimals)} ${token.baseSymbol} · ${amount(token.claimableQuote, token.quoteDecimals)} ${token.quoteSymbol}`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--m-text-secondary-2)]">
            Vesting{token.vestedPct !== null && ` · ${token.vestedPct.toFixed(0)}%`}
          </div>
          <div className="mt-0.5 text-[var(--m-text-primary)]">
            {token.live
              ? `${amount(token.vestingBase, token.baseDecimals)} ${token.baseSymbol} · ${amount(token.vestingQuote, token.quoteDecimals)} ${token.quoteSymbol}`
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={addHref} className={actionClass(true)}>
          Add
        </Link>
        <button type="button" onClick={onWithdraw} className={actionClass(false)}>
          Withdraw
        </button>
        <button type="button" onClick={onAdjust} className={actionClass(false)}>
          Adjust distribution
        </button>
        <button
          type="button"
          onClick={onCollect}
          disabled={!claimable || collecting}
          title={!claimable && vesting ? "Nothing has vested yet — collecting never forfeits, so it waits." : undefined}
          className={cn(actionClass(false), "disabled:cursor-not-allowed disabled:opacity-40")}
        >
          {collecting ? "Collecting…" : "Collect fees"}
        </button>
      </div>
    </article>
  );
}

function actionClass(primary: boolean) {
  return cn(
    "inline-flex min-h-[40px] items-center rounded-xl px-3.5 text-[13px] font-medium active:scale-[0.96] [transition-property:color,background-color,border-color,scale]",
    primary
      ? "bg-[var(--m-primary)] text-[var(--m-on-primary)] hover:bg-[var(--m-primary-hover)]"
      : "border border-[var(--m-border)] text-[var(--m-text-secondary)] hover:border-[var(--m-primary)] hover:text-[var(--m-primary)]",
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--m-text-secondary-2)]">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-[13px] tabular-nums",
          tone === "up" ? "text-[var(--m-success-fg)]" : tone === "down" ? "text-[var(--m-error)]" : "text-[var(--m-text-primary)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
