"use client";

import { cn } from "@/lib/utils";
import { formatMaturity, quoteSingleSided, type BandSet } from "@/lib/liquidity/bands";

export type DepositMode = "both" | "one";

const n = (v: string) => Number.parseFloat(v.replace(/,/g, "")) || 0;
const f = (v: number, d = 4) => v.toLocaleString(undefined, { maximumFractionDigits: d });

/**
 * Amounts, conversion and vesting for a banded deposit.
 *
 * Two things here have no equivalent in the per-position flow this replaces, and
 * both are things an LP can lose money to while every number on screen is correct:
 *
 *  - **One-token deposits convert.** A band holds pooled reserves and one shares
 *    scalar, so a deposit must arrive at the band's ratio. Bringing one token means
 *    half of it is swapped first. The position that results is ordinary and
 *    two-sided — single-sided in what you BRING, not in what you HOLD. It does not
 *    convert as price crosses it the way a v3 out-of-range position did.
 *  - **Fees vest.** Leaving before maturity forfeits the unvested part to the rest
 *    of the band, permanently, and claiming early never wins.
 */
export function BandDeposit({
  set,
  bandIndex,
  selectedBands,
  baseSym,
  quoteSym,
  anchor,
  bandIsEmpty,
  mode,
  onMode,
  amtBase,
  amtQuote,
  onAmtBase,
  onAmtQuote,
  amtOne,
  onAmtOne,
  oneIsBase,
  onOneIsBase,
}: {
  set: BandSet;
  bandIndex: number;
  /** Every band this deposit will seed, in fill order. */
  selectedBands: number[];
  baseSym: string;
  quoteSym: string;
  anchor: number;
  bandIsEmpty: boolean;
  mode: DepositMode;
  onMode: (m: DepositMode) => void;
  amtBase: string;
  amtQuote: string;
  onAmtBase: (v: string) => void;
  onAmtQuote: (v: string) => void;
  amtOne: string;
  onAmtOne: (v: string) => void;
  oneIsBase: boolean;
  onOneIsBase: (v: boolean) => void;
}) {
  const inSym = oneIsBase ? baseSym : quoteSym;
  const outSym = oneIsBase ? quoteSym : baseSym;
  const q = quoteSingleSided(n(amtOne), anchor, oneIsBase, set.feePct);

  const want = n(amtBase) * anchor;
  const got = n(amtQuote);
  const refund =
    Math.abs(got - want) < 0.5
      ? "none — exact ratio"
      : got > want
        ? `${f(got - want, 2)} ${quoteSym} back`
        : `${f((want - got) / anchor)} ${baseSym} back`;

  return (
    <div className="flex flex-col gap-3">
      {selectedBands.length > 1 && (
        /* The split is stated, never left to be inferred. An LP who selected three
           bands is opening three positions and spending a third in each; a single
           total with no breakdown reads as one position of that size. */
        <div className="rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-2.5 text-[12px]">
          <b className="block text-[13px]">
            {selectedBands.length} positions, split evenly
          </b>
          <span className="text-[var(--m-text-secondary)]">
            Each band is a separate share pool, so it gets its own position and its own
            vesting clock. Splitting {selectedBands.length} ways puts{" "}
            <span className="font-mono">{f(n(amtBase) / selectedBands.length)}</span>{" "}
            {baseSym}
            {mode === "both" && (
              <>
                {" + "}
                <span className="font-mono">{f(n(amtQuote) / selectedBands.length, 2)}</span>{" "}
                {quoteSym}
              </>
            )}{" "}
            into each of {selectedBands.map((i) => `±${(set.bands[i]!.tolerance * 100).toFixed(2)}%`).join(", ")}.
          </span>
        </div>
      )}
      <div className="flex gap-1 rounded-full bg-[var(--m-surface-2)] p-[3px]">
        {(["both", "one"] as DepositMode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onMode(m)}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-[13px] transition-colors",
              mode === m
                ? "bg-[var(--m-primary)] font-semibold text-[var(--m-on-primary)]"
                : "text-[var(--m-text-secondary)]",
            )}
          >
            {m === "both" ? "Both tokens" : "One token"}
          </button>
        ))}
      </div>

      {mode === "both" ? (
        <>
          <p className="text-[12px] text-[var(--m-text-secondary)]">
            This band accepts 1 {baseSym} : {f(anchor, 2)} {quoteSym}. Anything over
            that ratio is refunded, not kept.
          </p>
          <Field label={baseSym} value={amtBase} onChange={onAmtBase} sym={baseSym} />
          <Field label={quoteSym} value={amtQuote} onChange={onAmtQuote} sym={quoteSym} />
          <Row k="Refund at this ratio" v={refund} />
        </>
      ) : (
        <>
          <p className="text-[12px] text-[var(--m-text-secondary)]">
            Bring one token. Half is converted at the band&apos;s price so the deposit
            lands at the band&apos;s ratio.
          </p>
          <Field
            label="You bring"
            value={amtOne}
            onChange={onAmtOne}
            sym={inSym}
            onSwap={() => onOneIsBase(!oneIsBase)}
          />

          {bandIsEmpty ? (
            <div className="rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-2.5 text-[12px]">
              <b className="block">Nothing is converted here.</b>
              <span className="text-[var(--m-text-secondary)]">
                This band is empty, so your deposit <b>defines its ratio</b>. One token
                is all it takes, and there is no price to convert at yet.
              </span>
            </div>
          ) : (
            <>
              <div className="rounded-[11px] border border-dashed border-[var(--m-border)] px-2.5 py-1.5">
                <Row k="Converted" v={`${f(q.convert)} ${inSym}`} />
                {/* Estimates, and they say so: execution is at the band's bound, which
                    is not known until the swap returns. */}
                <Row k="Received" v={`≈ ${f(q.receive, 2)} ${outSym}`} />
                <Row k={`Conversion fee (${(set.feePct * 100).toFixed(2)}%)`} v={`≈ ${f(q.fee, 2)} ${outSym}`} />
              </div>
              <div className="rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-2.5 text-[12px]">
                <b className="block">This moves the band.</b>
                <span className="text-[var(--m-text-secondary)]">
                  The conversion runs through this band, so it spends the band&apos;s{" "}
                  {outSym} and leaves everyone in it slightly more {inSym}-heavy. The{" "}
                  {(set.feePct * 100).toFixed(2)}% fee is what compensates them.
                </span>
              </div>
            </>
          )}
        </>
      )}

      <div className="rounded-[11px] border border-[var(--m-primary)] bg-[var(--m-primary)]/10 p-2.5">
        <b className="block text-[13px]">Fees vest over {formatMaturity(set.maturitySec)}</b>
        <p className="mt-0.5 text-[12px] text-[var(--m-text-secondary)]">
          Withdraw before then and the unvested part goes to the other LPs in band{" "}
          {bandIndex}. It is not returned later. Holding past maturity pays 100% of
          everything accrued, so claiming early never wins.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  sym,
  onSwap,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  sym: string;
  onSwap?: () => void;
}) {
  return (
    <div className="rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-2.5 py-2">
      <label className="mb-0.5 block text-[11px] text-[var(--m-text-secondary)]">{label}</label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-[17px] tabular-nums text-[var(--m-text-primary)] outline-none"
        />
        {onSwap ? (
          <button
            type="button"
            onClick={onSwap}
            className="rounded-lg border border-[var(--m-border)] px-2 py-0.5 font-mono text-[12px] text-[var(--m-text-secondary)] hover:text-[var(--m-text-primary)]"
          >
            {sym} ⇅
          </button>
        ) : (
          <span className="font-mono text-[12px] text-[var(--m-text-secondary)]">{sym}</span>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[12px]">
      <span className="text-[var(--m-text-secondary)]">{k}</span>
      <span className="font-mono tabular-nums">{v}</span>
    </div>
  );
}
