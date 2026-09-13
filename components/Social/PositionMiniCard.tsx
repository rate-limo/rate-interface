"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { TokenAvatar } from "@/components/Portfolio/parts";
import { formatUsd } from "@/utils/number";
import { UNTRACKED_TITLE } from "@/lib/portfolio/positions";
import type { SpotPosition } from "@/lib/portfolio/types";

/**
 * One position, rendered as a card — the unit shared by the feed (centre
 * column) and Top trades (right column).
 *
 * It lives in `Social/` rather than in either column because both render the
 * SAME card and the two must not drift: a change to how a position reads
 * (closed state, basis line, the PnL split) has to land in one place or the
 * right rail starts disagreeing with the feed about the same wallet's trade.
 *
 * ## Realised and unrealised are never summed here
 *
 * `SpotPosition` keeps them apart on purpose — realised is a ledger fact,
 * unrealised is a function of a live price and is `null` when the token has no
 * price (see the type's own notes). Adding them would produce a number that is
 * silently part guess for any unpriced row, so `net` falls back to realised
 * alone when `unrealizedPnlUSD` is null, and the caller gets `priced` to say so.
 *
 * ## Colour is never the only carrier
 *
 * Per DESIGN.md, a PnL figure always ships with an explicit sign and a numeric
 * label; the green/red is redundant reinforcement, not the signal. That is also
 * why a zero renders as `$0` in the neutral ink rather than as a green `+$0`.
 */

/** `0.04000` -> `0.04`. Precision the number does not carry is not shown. */
function trimTrailingZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * `+$1,234` / `−$1,234`, with a true minus sign rather than a hyphen — and
 * sub-dollar PnL that keeps its digits.
 *
 * ## Why this is not just `money` with a sign
 *
 * `money` rounds to whole dollars, so every figure under fifty cents collapsed
 * to `$0`. That is most of them here: a launch token trades in the 1e-5 range,
 * so a wallet's entire realised PnL can sit below a cent, and `$0` is
 * indistinguishable from a position that never moved — the same information
 * loss `formatSubscriptDecimal` was written for on the price surfaces, in the
 * one place a trader is looking for whether they made money.
 *
 * Below a dollar this uses SUBSCRIPT-ZERO notation (`+$0.0₂45`), the convention pump.fun
 * and DexScreener use and the one this app already uses for prices; at a thousand and
 * above it compacts (`+$1.2k`, `+$4.1m`). Both come from `formatUsd`, which is the single
 * place that rule lives — this used to call `money`, which did neither.
 *
 * The 0.01–0.99 band renders plainly (`+$0.04`), because
 * `formatSubscriptDecimal` returns null under two leading zeros — notation
 * there costs a reader more than the zeros do.
 *
 * An exact zero is still `$0`, and only an exact zero: the caller colours on
 * `value >= 0`, so a real +$0.0₃4 must not keep wearing the label of a flat
 * position.
 */
export function signedMoney(n: number): string {
  if (n === 0) return "$0";
  // `formatUsd` is handed a POSITIVE value on purpose: it prefixes a plain hyphen for a
  // negative, and this surface spells one with a true minus (−) beside a leading +.
  return (n > 0 ? "+" : "−") + formatUsd(Math.abs(n));
}

/** Net PnL for a row, and whether a live price actually backed it. */
export function netPnl(p: SpotPosition): { value: number; priced: boolean } {
  return p.unrealizedPnlUSD === null
    ? { value: p.realizedPnlUSD, priced: false }
    : { value: p.realizedPnlUSD + p.unrealizedPnlUSD, priced: true };
}

export function PositionMiniCard({
  position,
  networkSlug,
  note,
  className,
}: {
  position: SpotPosition;
  networkSlug: string;
  /** A callout body, when this card is rendered inside the feed. */
  note?: string | null;
  className?: string;
}) {
  // `amount === 0` is the ledger's definition of closed (see SpotPosition), and
  // a closed row keeps its realised PnL — it is not filtered out, because a
  // wallet's lifetime PnL would shrink as it closed trades if it were.
  const closed = position.amount === 0;
  const net = netPnl(position);
  const up = net.value >= 0;

  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3",
        className,
      )}
    >
      <div className="flex w-full items-center gap-3">
        <Link
          href={`/token/${position.token}?chain=${encodeURIComponent(networkSlug)}`}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <TokenAvatar symbol={position.symbol} logoURI={position.logoURI ?? undefined} />
          <span className="flex min-w-0 flex-col gap-0.5 leading-4">
            <span className="truncate text-xs font-bold tracking-[-0.12px] text-[color:var(--m-text-primary)]">
              {position.symbol}
            </span>
            <span className="truncate text-[11px] text-[color:var(--m-text-secondary)]">
              {position.tradeCount} {position.tradeCount === 1 ? "trade" : "trades"}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <span className="flex flex-col items-end gap-0.5 text-xs leading-4">
            <span className="whitespace-nowrap text-[color:var(--m-text-secondary)]">Position</span>
            {closed ? (
              <span className="-mr-1 inline-flex items-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-2 py-0.5 text-[11px] font-medium leading-4 text-[color:var(--m-text-secondary)]">
                Closed
              </span>
            ) : (
              <span className="whitespace-nowrap tabular-nums text-[color:var(--m-text-primary)]">
                {formatUsd(position.valueUSD)}
              </span>
            )}
          </span>

          <span className="flex flex-col items-end gap-0.5 text-xs leading-4">
            <span className="whitespace-nowrap text-[color:var(--m-text-secondary)]">
              {/* The label itself carries the caveat when no live price backed
                  the figure, so an unpriced row cannot read as a full net. */}
              {net.priced ? "Net PNL" : "Realised"}
            </span>
            <span
              className={cn(
                "whitespace-nowrap tabular-nums",
                up ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]",
              )}
            >
              {signedMoney(net.value)}
            </span>
          </span>
        </div>
      </div>

      {(position.costUSD > 0 || position.avgEntryUSD > 0) && (
        <div className="flex w-full items-center justify-between text-[11px] leading-4">
          {position.costUSD > 0 ? (
            <span className="flex items-center gap-1">
              <span className="text-[color:var(--m-text-secondary)]">Spent</span>
              <span className="font-semibold tabular-nums text-[color:var(--m-text-secondary-2)]">
                {formatUsd(position.costUSD)}
              </span>
            </span>
          ) : (
            <span />
          )}
          {position.avgEntryUSD > 0 ? (
            <span className="flex items-center gap-1">
              <span className="text-[color:var(--m-text-secondary)]">Avg entry</span>
              <span className="font-semibold tabular-nums text-[color:var(--m-text-secondary-2)]">
                {formatUsd(position.avgEntryUSD)}
              </span>
            </span>
          ) : (
            <span />
          )}
        </div>
      )}

      {/* `untrackedSold` means the cost basis is incomplete. The type's own note
          says the UI must say so rather than imply the numbers are whole — and
          `UNTRACKED_TITLE` is how the other two surfaces say it. */}
      {position.untrackedSold > 0 && (
        <p className="text-[11px] leading-4 text-[color:var(--m-warning-600)]">
          {UNTRACKED_TITLE}
        </p>
      )}

      {note && (
        <div className="-mx-3 -mb-0.5 w-[calc(100%+1.5rem)] border-t border-[color:var(--m-border)] px-3 pt-2">
          <p className="line-clamp-3 text-xs leading-4 text-[color:var(--m-text-secondary-2)]">
            {note}
          </p>
        </div>
      )}
    </article>
  );
}
