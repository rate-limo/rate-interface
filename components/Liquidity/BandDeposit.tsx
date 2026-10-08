"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { formatMaturity, quoteSingleSided, type BandSet } from "@/lib/liquidity/bands";
import { maxFieldAmount } from "@/lib/liquidity/balance";
import { DEPOSIT_DECIMALS } from "./steps/parts";

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
/**
 * Both tokens / One token.
 *
 * Lives here rather than in `LiquidityFlow` because this is the panel the choice
 * governs — but it is EXPORTED, because the flow now asks the question a step
 * earlier, before the range. Deciding how you are funding the position is an
 * input to choosing a range, not a detail discovered beside it.
 */
export function DepositModeToggle({
  mode,
  onMode,
}: {
  mode: DepositMode;
  onMode: (m: DepositMode) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-[var(--m-surface-2)] p-[3px]">
      {(["both", "one"] as DepositMode[]).map((m) => (
        <button
          key={m}
          type="button"
          data-testid={`liq-deposit-mode-${m}`}
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
  );
}

/**
 * WHAT HAPPENS TO THE ONE TOKEN — convert it now, or let traders convert it.
 *
 * Only ever shown for a one-token deposit, and NEITHER half can be unavailable:
 * `BandPool._price` prices a one-sided deposit by value, so every band takes one
 * token. This used to disable the wall on bands that could not price it pro-rata,
 * which on a ladder with one traded band refused a deposit two thirds of it would
 * have accepted. See `lib/liquidity/wall.ts` for what the rule was and why it
 * went.
 */
export function ConversionModeToggle({
  wall,
  onWall,
  inSym,
  outSym,
  feePct,
}: {
  wall: boolean;
  onWall: (next: boolean) => void;
  inSym: string;
  outSym: string;
  feePct: number;
}) {
  /*
   * COST FIRST, THEN WHAT HAPPENS TO THE MONEY.
   *
   * `Free` / `0.05% fee` is the fact the choice turns on, so it sits beside the
   * name rather than at the end of a sentence. Both names begin with "Convert",
   * which is what makes the axis legible at a glance -- gradually, or half now.
   * "Let traders convert it" named the MECHANISM, and nobody picks a mechanism.
   *
   * This was 116 words across two cards and a third panel repeating the selected
   * card almost verbatim. It is 24 now. The old copy was not hard to read so much
   * as long, and long is what stops it being read at all.
   *
   * What was cut and where it went: "this is not a limit order" is true and
   * important and answers a question nobody has asked yet, so it moved to the
   * Review step beside the thing it qualifies.
   *
   * ## Never let a bare ticker carry the meaning
   *
   * "Your USDC turns into TWALL" reads as nonsense to anyone who does not already
   * know TWALL is the other half of this pair -- which is most people, and every
   * first-time LP. The verb is what fixes it: "traders SWAP your USDC INTO TWALL"
   * makes the role of the unfamiliar word obvious from the sentence, without
   * spending a clause explaining it.
   */
  const options = [
    {
      key: true,
      name: "Convert gradually",
      cost: "Free",
      free: true,
      blurb: `Traders swap your ${inSym} into ${outSym} over time, and you earn a fee on each trade.`,
    },
    {
      key: false,
      name: "Convert half now",
      cost: `${(feePct * 100).toFixed(2)}% fee`,
      free: false,
      blurb: `Half your ${inSym} becomes ${outSym} right away, so you hold both.`,
    },
  ];
  return (
    /*
     * A radio GROUP, because that is what two exclusive options are. It also
     * halves the height against the stacked cards this replaced -- which is most
     * of why the Review button was off screen.
     */
    <div role="radiogroup" aria-label="How your deposit is converted" className="flex flex-col gap-1.5">
      {options.map((o) => {
        const on = wall === o.key;
        return (
          <button
            key={String(o.key)}
            type="button"
            role="radio"
            aria-checked={on}
            data-testid={o.key ? "liq-mode-wall" : "liq-mode-convert"}
            onClick={() => onWall(o.key)}
            className={cn(
              "flex items-start gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
              on
                ? "border-[var(--m-primary)] bg-[color-mix(in_srgb,var(--m-primary)_8%,transparent)]"
                : "border-[var(--m-border)] bg-[var(--m-surface-2)]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 size-[15px] flex-none rounded-full border-[1.5px] bg-[var(--m-surface)]",
                on ? "border-[var(--m-primary)]" : "border-[var(--m-border-2,var(--m-border))]",
              )}
            >
              {on && (
                <span className="absolute inset-[3px] rounded-full bg-[var(--m-primary)]" />
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-px">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("text-[13.5px] font-semibold", on && "text-[var(--m-primary-fg)]")}>
                  {o.name}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full px-1.5 py-px font-mono text-[10px] tracking-[0.04em]",
                    o.free
                      ? "bg-[color-mix(in_srgb,var(--m-success)_16%,transparent)] text-[var(--m-success-fg,var(--m-success))]"
                      : "border border-[var(--m-border)] bg-[var(--m-surface)] text-[var(--m-text-secondary)]",
                  )}
                >
                  {o.cost}
                </span>
              </span>
              <span className="text-[12px] leading-snug text-[var(--m-text-secondary)]">
                {o.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Fees vest over N minutes.
 *
 * EXPORTED so it can be rendered beside the chart rather than in the deposit
 * rail. It is a property of the BANDS -- which ones, and for how long -- and the
 * rail is where the deposit itself lives. See RangeStep's column split.
 */
export function VestingNotice({ maturitySec, bandIndex }: { maturitySec: number; bandIndex: number }) {
  return (
    <div className="rounded-[11px] border border-[var(--m-primary)] bg-[var(--m-primary)]/10 p-2.5">
      <b className="block text-[13px]">Fees vest over {formatMaturity(maturitySec)}</b>
      <p className="mt-0.5 text-[12px] text-[var(--m-text-secondary)]">
        Withdraw before then and the unvested part goes to the other LPs in band{" "}
        {bandIndex}. It is not returned later. Holding past maturity pays 100% of
        everything accrued, so claiming early never wins.
      </p>
    </div>
  );
}

export function BandDeposit({
  set,
  bandIndex,
  baseSym,
  quoteSym,
  anchor,
  bandIsEmpty,
  mode,
  onMode,
  showMode = true,
  amtBase,
  amtQuote,
  onAmtBase,
  onAmtQuote,
  amtOne,
  onAmtOne,
  oneIsBase,
  onOneIsBase,
  wall = false,
  onWall,
  balanceOf,
  onMax,
  shortSymbol,
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
  /** The flow asks this BEFORE the range step, so the panel does not repeat the
   *  control. Two switches over one piece of state is one of them going stale in
   *  a reader's head, even when they cannot actually disagree. */
  showMode?: boolean;
  amtBase: string;
  amtQuote: string;
  onAmtBase: (v: string) => void;
  onAmtQuote: (v: string) => void;
  amtOne: string;
  onAmtOne: (v: string) => void;
  oneIsBase: boolean;
  onOneIsBase: (v: boolean) => void;
  /** One-token deposits only: true means deposit without converting. */
  wall?: boolean;
  onWall?: (next: boolean) => void;
  /** What the wallet holds, by symbol. Undefined for "not known". */
  balanceOf?: (symbol: string) => number | undefined;
  /**
   * Fill a field with everything spendable. The caller decides what that means
   * — on the chain's gas asset it is not the whole balance, because the deposit
   * still has to pay for two or three transactions.
   */
  onMax?: (symbol: string, side: "base" | "quote" | "one") => void;
  /** The one field asking for more than the wallet holds, if any. */
  shortSymbol?: string;
}) {
  const inSym = oneIsBase ? baseSym : quoteSym;
  const outSym = oneIsBase ? quoteSym : baseSym;
  const q = quoteSingleSided(n(amtOne), anchor, oneIsBase, set.feePct);

  /*
   * What comes back, and it is not a fee or a penalty.
   *
   * A band holds both tokens at one ratio, so it can only take the two amounts in
   * that proportion. Type more of one than the ratio uses and the excess is
   * returned in the same transaction. This row said "Refund at this ratio" with a
   * value of "none — exact ratio", which names the mechanism and not the outcome:
   * the reader's question is "do I get anything back", and both halves answered in
   * the pool's vocabulary instead.
   */
  const want = n(amtBase) * anchor;
  const got = n(amtQuote);
  const typedBoth = n(amtBase) > 0 || n(amtQuote) > 0;
  const exact = Math.abs(got - want) < 0.5;
  const refundSym = got > want ? quoteSym : baseSym;
  const refund = !typedBoth
    ? "—"
    : exact
      ? "nothing"
      : got > want
        ? `${f(got - want, 2)} ${quoteSym}`
        : `${f((want - got) / anchor)} ${baseSym}`;

  return (
    <div className="flex flex-col gap-3">
      {showMode && <DepositModeToggle mode={mode} onMode={onMode} />}

      {mode === "both" ? (
        <>
          {/* `data-anchor` is the unrounded rate. 0 means "no rate yet", and the
              paired fields below clear each other until it is positive — so e2e
              waits on this rather than typing into a form that cannot pair. */}
          <p
            data-testid="liq-band-ratio"
            data-anchor={anchor}
            className="text-[12px] text-[var(--m-text-secondary)]"
          >
            Ratio 1 {baseSym} : {f(anchor, 2)} {quoteSym}
          </p>
          <Field
            label={baseSym}
            value={amtBase}
            onChange={onAmtBase}
            sym={baseSym}
            balance={balanceOf?.(baseSym)}
            onMax={onMax && (() => onMax(baseSym, "base"))}
            short={shortSymbol === baseSym}
            testId="liq-amount-base"
          />
          <Field
            label={quoteSym}
            value={amtQuote}
            onChange={onAmtQuote}
            sym={quoteSym}
            balance={balanceOf?.(quoteSym)}
            onMax={onMax && (() => onMax(quoteSym, "quote"))}
            short={shortSymbol === quoteSym}
            testId="liq-amount-quote"
          />
          <Row k="Sent back to you" v={refund} />
          {typedBoth && !exact && (
            <p className="-mt-1 text-[11.5px] leading-snug text-[var(--m-text-secondary)]">
              A band takes both tokens at one fixed ratio, and you have typed more{" "}
              {refundSym} than this ratio uses. The extra is returned to your wallet in
              the same transaction — it is not spent and not lost.
            </p>
          )}
        </>
      ) : (
        <>
          <Field
            label="You bring"
            value={amtOne}
            onChange={onAmtOne}
            sym={inSym}
            onSwap={() => onOneIsBase(!oneIsBase)}
            balance={balanceOf?.(inSym)}
            onMax={onMax && (() => onMax(inSym, "one"))}
            short={shortSymbol === inSym}
            testId="liq-amount-one"
          />

          {onWall && (
            <ConversionModeToggle
              wall={wall}
              onWall={onWall}
              inSym={inSym}
              outSym={outSym}
              feePct={set.feePct}
            />
          )}

          {/*
            THE CONVERSION PREVIEW BELONGS TO THE CONVERSION.
            `wall` swaps nothing, so "Converted 0.5 TWALL / Received ~0.5 USDC /
            Conversion fee" describes a trade that will not happen -- and it was
            rendering under the option whose entire selling point is that it
            costs nothing. Gated on the mode, not just on the band.
          */}
          {wall ? null : bandIsEmpty ? (

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

    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  sym,
  onSwap,
  balance,
  onMax,
  short,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  sym: string;
  onSwap?: () => void;
  /**
   * What the wallet holds. `undefined` means NOT KNOWN — a disconnected wallet,
   * a read still in flight, or a token the list does not carry — and the row is
   * then absent rather than printing a zero, which would be a statement about
   * someone's money that happens to be false.
   */
  balance?: number;
  onMax?: () => void;
  /** This field alone is asking for more than the wallet holds. */
  short?: boolean;
  /**
   * A stable hook for e2e. It existed because the two-sided fields had no
   * accessible name to find them by; they do now — `getByLabel("USDC amount")`
   * resolves — so this is a convenience rather than the only way in.
   */
  testId?: string;
}) {
  /*
   * The label is always ASSOCIATED, and only sometimes VISIBLE.
   *
   * It used to be conditional outright: in two-sided mode the caller passes the
   * ticker as both label and symbol, so the field rendered "USDC" on its own
   * line and "USDC" again beside the input — a wasted row in the narrowest
   * column on the page. Suppressing the element fixed that and cost the input
   * its accessible name, which the `testId` prop below then existed to work
   * around: e2e could not find the field either.
   *
   * Rendering it either way and hiding it with `sr-only` keeps the association
   * in both modes. Where a real label IS shown ("You bring"), it stays the
   * accessible name too, so the name still contains the visible text.
   */
  const inputId = useId();
  const labelRepeatsTicker = label.trim().toUpperCase() === sym.trim().toUpperCase();

  return (
    <div
      className={cn(
        "rounded-[11px] border bg-[var(--m-surface-2)] px-2.5 py-2",
        short ? "border-[var(--m-error)]" : "border-[var(--m-border)]",
      )}
    >
      {/*
        * The label is drawn only when it SAYS something the symbol does not.
        *
        * In two-sided mode the caller passes the ticker as the label and the
        * same ticker as the symbol, so the field rendered "VF15CK" on its own
        * line and "VF15CK" again beside the input — a whole row per field
        * spent repeating itself, in the narrowest column on the page.
        * "You bring" is a real label and still shows.
        */}
      <label
        htmlFor={inputId}
        className={cn(
          "mb-0.5 block text-[11px] text-[var(--m-text-secondary)]",
          labelRepeatsTicker && "sr-only",
        )}
      >
        {labelRepeatsTicker ? `${sym} amount` : label}
      </label>
      <div className="flex items-center gap-2">
        {/* A placeholder, because an empty amount field here is otherwise a
            blank rectangle: the label is suppressed when it would repeat the
            ticker, so in two-sided mode there is nothing at all to say a number
            goes in. `0.00` rather than "Amount" so the hint sits in the same
            shape, font and alignment as the value that replaces it. */}
        <input
          id={inputId}
          data-testid={testId}
          value={value}
          inputMode="decimal"
          placeholder="0.00"
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-[17px] tabular-nums text-[var(--m-text-primary)] outline-none placeholder:text-[var(--m-text-secondary-2)]"
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

      {/* Absent when the balance is unknown — see the prop doc. */}
      {balance !== undefined && (
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
          <span className={short ? "text-[var(--m-error)]" : "text-[var(--m-text-secondary-2)]"}>
            {short ? "More than you hold · " : "Balance "}
            {/* Floored, not rounded — the same rule Max fills by. `f` rounds to
                NEAREST, so a held 3.91705 printed as "3.9171": a balance row
                claiming a fraction more than the wallet has, and, once Max
                started flooring, a number Max visibly refused to match. A
                balance display may understate by less than the last place it
                shows; it may never overstate. */}
            <span className="font-mono tabular-nums">
              {f(maxFieldAmount(balance, DEPOSIT_DECIMALS))}
            </span>{" "}
            {sym}
          </span>
          {onMax && (
            <button
              type="button"
              onClick={onMax}
              className="font-mono text-[11px] text-[var(--m-primary-fg)] hover:underline"
            >
              Max
            </button>
          )}
        </div>
      )}
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
