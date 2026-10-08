"use client";

/**
 * Step 2 — the market's taker fee and volatility. Launch only.
 *
 * Both are written on chain by `AssetGenerator.listPair`, the call that creates
 * the market, and both are the lister's to change later within the same
 * bounds. The choices offered are the generator's bounds read from the
 * contract (`useListBounds`), so nothing selectable here can revert.
 *
 * Providing liquidity to an existing pair chooses neither — the pair already has
 * both — so `DEPOSIT_STEPS` omits this step. The read-only branch is kept
 * because `/pool/new` can still reach it.
 *
 * The fee classifier's answer is still printed underneath as a suggestion: the
 * fee is the lister's own compensation to price, so it advises and never
 * restricts.
 */

import { cn } from "@/lib/utils";
import { BackButton } from "../BackButton";
import { feePolicy, type MarketFeeClass } from "@/lib/fees/strategy";
import { allowedFees, allowedVolatility, type ListBounds } from "@/lib/liquidity/launchPolicy";
import type { FeeTier } from "@/lib/liquidity/types";

export function FeeStep({
  launch,
  base,
  quote,
  fee,
  onFee,
  volatilityBps,
  onVolatility,
  bounds,
  /** The classifier's answer, rendered as advice and never as a restriction. */
  suggestion,
  /**
   * The LP/protocol split, read from the deployment registry. Empty when the
   * registry has no value — omitting the claim beats guessing a number.
   */
  lpFeeCopy,
  onBack,
  onContinue,
}: {
  launch: boolean;
  base: string;
  quote: string;
  fee: FeeTier;
  onFee: (next: FeeTier) => void;
  volatilityBps: number;
  onVolatility: (bps: number) => void;
  bounds: ListBounds | null;
  suggestion: MarketFeeClass;
  lpFeeCopy: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const fees = allowedFees(bounds);
  const vols = allowedVolatility(bounds);
  const ready = !launch || (fees.includes(fee) && vols.some((v) => v.bps === volatilityBps));
  return (
        <div className="mx-auto max-w-[520px] rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2.5">
            <BackButton onClick={onBack} label="Back to the pair" />
            <h3 className="text-[17px] font-semibold">{launch ? "Fee and volatility" : "Pair fee"}</h3>
          </div>
          <p className="mb-4 text-[13px] text-[var(--m-text-secondary)]">
            What takers pay on {base}/{quote}, and how far one order may move its price.
          </p>

          {launch ? (
            <>
              <div className="mb-[7px] mt-3.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
                <span>Taker fee</span>
                <span>Makers pay 0%</span>
              </div>
              {fees.length === 0 ? (
                <p className="text-[12px] text-[var(--m-text-secondary)]">Reading the allowed fees…</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {fees.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={t === fee}
                      onClick={() => onFee(t)}
                      className={cn(
                        "rounded-[9px] border px-3 py-2.5 font-mono text-[14px] tabular-nums",
                        t === fee
                          ? "border-[var(--m-primary)] bg-[var(--m-primary-100)] text-[var(--m-primary-fg)]"
                          : "border-[var(--m-border)] bg-[var(--m-surface-2)] text-[var(--m-text-secondary)]",
                      )}
                    >
                      {t}%
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-[7px] mt-4 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
                <span>Volatility</span>
                <span>Max move per order</span>
              </div>
              {vols.length === 0 ? (
                <p className="text-[12px] text-[var(--m-text-secondary)]">Reading the allowed range…</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {vols.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={v.bps === volatilityBps}
                      onClick={() => onVolatility(v.bps)}
                      className={cn(
                        "flex min-h-[64px] flex-col justify-between rounded-[9px] border px-3 py-2.5 text-left",
                        v.bps === volatilityBps
                          ? "border-[var(--m-primary)] bg-[var(--m-primary-100)] text-[var(--m-primary-fg)]"
                          : "border-[var(--m-border)] bg-[var(--m-surface-2)] text-[var(--m-text-secondary)]",
                      )}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className="text-[13px] font-medium">{v.label}</span>
                        <span className="font-mono text-[12px] tabular-nums">{(v.bps / 100).toFixed(2)}%</span>
                      </span>
                      <span className="text-[10px] leading-snug text-[var(--m-text-secondary-2)]">{v.description}.</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-[9px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--m-text-primary)]">Canonical pair fee</span>
                <span className="font-mono text-[12px] text-[var(--m-text-secondary)]">Onchain · read only</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--m-text-secondary-2)]">
                Adding liquidity uses the fee already set for this pair. A second pool cannot be created by choosing another one.
              </p>
            </div>
          )}
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--m-text-secondary)]">
            {launch ? (
              <>
                Suggested fee for {base}/{quote}:{" "}
                <span className="text-[var(--m-text-primary)]">{feePolicy(suggestion).feePct}%</span>. A
                suggestion, not a restriction. You can change both later.{" "}
              </>
            ) : null}
            Rate keeps one canonical book per pair{lpFeeCopy}.
          </p>

          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              data-testid="liq-fee-continue"
              onClick={onContinue}
              disabled={!ready}
              className="flex-1 rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
  );
}
