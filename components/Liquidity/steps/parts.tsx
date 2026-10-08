"use client";

/**
 * Shared primitives for the liquidity steps.
 *
 * These lived at the foot of `LiquidityFlow` while that file held all four
 * steps. They moved out with the steps rather than being duplicated into them.
 *
 * The rate formatter is NOT here: `formatRate` lives in lib/liquidity/rate.ts,
 * beside the resolution it formats, because the band chart prints the same
 * number and importing a step's parts from a sibling component would invert the
 * dependency. Two copies of a number formatter is how one figure comes to
 * render two ways on two screens of one flow.
 *
 * Named after `components/Launch/parts.tsx`, which does the same job for the
 * launch flow's steps.
 */

import type { useDepositApr } from "@/hooks/useDepositApr";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { liqToken } from "@/lib/liquidity/mock";

/**
 * Precision the amount fields are captured and split at.
 *
 * One constant because the parse, the allocation and the receipt must agree:
 * split at four places and print at two and the band rows stop summing to the
 * deposit line directly above them.
 *
 * NOT the precision anything is deposited at — `ConfirmFlow` re-splits the same
 * shape at the token's own decimals, because these units are 10^14 short of
 * what an 18-decimal ERC-20 takes.
 */
export const DEPOSIT_DECIMALS = 4;

/** `chainName` is required, not optional: a token mark without its network chip
 *  is the one thing every OTHER token surface on the site draws, and leaving it
 *  off here is what made this picker look like a different product. Making it a
 *  required prop means a new call site cannot quietly drop it again. */
export function TokenSelect({
  role,
  sym,
  chainName,
  logoURI,
  onClick,
  testId,
}: {
  role: string;
  sym: string;
  chainName: string;
  /** The token's listed artwork. Without it this can only draw initials, which
   *  is what made the chosen pair look like two placeholders. */
  logoURI?: string;
  onClick: () => void;
  testId?: string;
}) {
  const t = liqToken(sym);
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex flex-1 items-center gap-2.5 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-3 text-left hover:border-[var(--m-primary)]"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">{role}</span>
      <TokenImageIcon symbol={sym} logoURI={logoURI} color={t.color} chainName={chainName} size="md" className="h-7 w-7 text-[8px]" />
      <span className="flex flex-col leading-tight">
        <b className="text-[15px] font-semibold">{sym}</b>
        {t.name && t.name.toLowerCase() !== sym.toLowerCase() && (
          <span className="text-[10.5px] text-[var(--m-text-secondary-2)]">{t.name}</span>
        )}
      </span>
      <span className="ml-auto text-xs text-[var(--m-text-secondary-2)]">▾</span>
    </button>
  );
}


/**
 * Why the estimate is missing, in words the LP can act on.
 *
 * Every one of these is a NAMED refusal from the gateway rather than a generic
 * failure, and the unknown case still says something — a row that explains
 * itself is doing work, where a bare em-dash reads as a broken page.
 *
 * `unavailable-for-band-pool` is kept even though the gateway stopped sending
 * it: the gateway and this app deploy separately, so an older one still answers
 * with it, and a client that only understood the new vocabulary would render
 * nothing at all against it.
 */
function aprReason(method: string | null | undefined): string {
  switch (method) {
    case "band-no-measurable-fees":
      return "No indexed fills for this pool yet, so there is no fee stream to measure.";
    case "band-no-indexed-price":
      return "No indexed price for this pair yet, so the reserves cannot be valued.";
    case "unavailable-for-band-pool":
      return "This gateway has no estimator for band pools. The figure exists on a newer one.";
    default:
      return "No estimate yet. It appears once this pool has indexed fills to measure.";
  }
}

/**
 * What this deposit would earn — the figure an LP is on this page for.
 *
 * It leads the card. It used to be a grey row under the band bid/ask cells
 * reading "not estimated for band pools", which is every pool Rate opens, and a
 * draft of the redesign proposed cutting it for being permanently empty. That
 * would have deleted the reason the page exists; see the APY section of
 * apps/web/CLAUDE.md, which this is the implementation of.
 *
 * Three states, and the middle one is the point: a real number, a named reason
 * there is none, or a measured zero. Never an invented figure — this is the
 * screen where someone commits capital, and a plausible-looking yield is the
 * worst thing it could print.
 */
export function AprHeadline({
  apr,
  depositQuote,
  quoteSym,
}: {
  apr: ReturnType<typeof useDepositApr>;
  /** The deposit valued in QUOTE units, which is what the return is paid in. */
  depositQuote: number;
  quoteSym: string;
}) {
  const pct = apr.data?.aprPct ?? null;
  const live = pct !== null && Number.isFinite(pct);
  const perYear = live && depositQuote > 0 ? (depositQuote * pct) / 100 : null;

  const money = (v: number) =>
    v >= 1
      ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : v.toPrecision(3);

  return (
    <div className="rounded-[13px] border border-[color:color-mix(in_srgb,var(--m-primary)_34%,var(--m-border))] bg-[color:color-mix(in_srgb,var(--m-primary)_9%,transparent)] px-4 py-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--m-text-secondary-2)]">
            Estimated APY
          </span>
          <span className="block font-mono text-[32px] leading-none text-[var(--m-primary)] tabular-nums">
            {apr.loading ? "…" : live ? `${formatPct(pct)}` : "—"}
          </span>
        </div>
        {perYear !== null && perYear > 0 && (
          <div className="text-right font-mono text-[11.5px] leading-6 text-[var(--m-text-secondary)]">
            <div>
              <b className="font-medium text-[var(--m-text-primary)]">
                {money(perYear / 365)}
              </b>{" "}
              {quoteSym} / day
            </div>
            <div>
              <b className="font-medium text-[var(--m-text-primary)]">{money(perYear)}</b>{" "}
              {quoteSym} / year
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-[var(--m-text-secondary-2)]">
        {/*
            Three captions, because there are three states and the middle one
            used to be missing. Before an amount is entered the figure is the
            POOL's realised rate — real, measured, and not yet diluted — so
            saying "no estimate yet, it appears once this pool has indexed
            fills" was false about a pool that had them. That sentence is still
            right for a pool with nothing to measure, and `aprReason` still
            carries the gateway's own word for which case that is.
         */}
        {apr.loading
          ? "Estimating from this pool's last 24 hours…"
          : !live
            ? aprReason(apr.data?.method)
            : apr.data?.diluted
              ? "Realised over the last 24 hours and diluted by your own deposit — the same fees, shared wider. Not a projection."
              : "The pool's realised rate over the last 24 hours. Enter an amount to see it diluted by your own deposit."}
      </p>
    </div>
  );
}

/** Two decimals, or significant digits when the rate is below a hundredth. */
function formatPct(v: number): string {
  return v >= 0.01 ? `${v.toFixed(2)}%` : `${Number(v.toPrecision(3))}%`;
}
