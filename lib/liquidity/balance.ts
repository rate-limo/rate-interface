/**
 * Can the wallet actually cover this deposit?
 *
 * The amount fields had no answer to that. Typing more than you hold bought you
 * an approval — a real transaction, real gas — then `addLiquidityAcross`, then a
 * revert reported as "The deposit reverted on chain", which names the wrong
 * cause. On a two-sided deposit that is TWO approvals spent before anything says
 * the amount was impossible.
 *
 * It got worse when the two sides were paired at the band ratio: typing a base
 * amount fills the quote side for you, so the form can now put a number you
 * cannot cover into a field you never touched.
 */

/** One side of a deposit: what is being spent, and how much. */
export interface DepositNeed {
  symbol: string;
  amount: number;
}

export type BalanceVerdict =
  /**
   * No usable answer — a disconnected wallet, a query still in flight, or a
   * token missing from the list. **Never blocks.** A missing balance is not a
   * zero balance: `TokenModal`'s own tests pin that rule for the picker, and
   * refusing a deposit because a read has not landed would be the same mistake
   * with money attached.
   */
  | { state: "unknown" }
  | { state: "ok" }
  | { state: "short"; symbol: string; held: number; needed: number };

/**
 * Shortfalls are reported before unknowns.
 *
 * A two-sided deposit can have one side short and the other unresolved, and the
 * short one is both true and actionable — reporting "we are not sure" there
 * would withhold the only fact the LP can use.
 */
export function checkDepositBalance(
  needs: readonly DepositNeed[],
  held: ReadonlyMap<string, number> | undefined,
): BalanceVerdict {
  if (!held) return { state: "unknown" };

  let sawUnknown = false;
  for (const need of needs) {
    if (!(need.amount > 0)) continue;
    const balance = held.get(need.symbol);
    if (balance === undefined || !Number.isFinite(balance)) {
      sawUnknown = true;
      continue;
    }
    if (balance < need.amount) {
      return { state: "short", symbol: need.symbol, held: balance, needed: need.amount };
    }
  }
  return sawUnknown ? { state: "unknown" } : { state: "ok" };
}

/**
 * The largest amount a field of `decimals` places can hold without exceeding
 * what the wallet actually has.
 *
 * Max used to format the spendable balance with `maximumFractionDigits`, which
 * rounds to NEAREST — so it rounds UP whenever the first dropped digit is 5 or
 * more. A balance of 3.91705 ITRA became the text "3.9171", and
 * `checkDepositBalance` then compared 3.91705 < 3.9171 and reported "More than
 * you hold" against the very number Max had just written. Observed on Arc's
 * ITRA/USDC with a held balance whose display and whose Max agreed to four
 * places and disagreed underneath.
 *
 * Rounding DOWN is the only safe direction here, and the asymmetry is the whole
 * point: a Max that proposes a hair less than the balance costs the LP a
 * fraction of the last decimal place, while a Max that proposes a hair more is
 * an amount that cannot be deposited at all. One is invisible, the other blocks
 * the button.
 *
 * `toPrecision(12)` before the floor guards the multiplication's own error:
 * `2 * 1e4` is exactly 20000, but plenty of decimal values land at
 * `…99999999996` once scaled, and flooring that would quietly drop a whole unit
 * of the last place from an exact balance.
 */
export function maxFieldAmount(spendable: number, decimals: number): number {
  if (!Number.isFinite(spendable) || spendable <= 0) return 0;
  const scale = 10 ** decimals;
  const scaled = Number((spendable * scale).toPrecision(12));
  const floored = Math.floor(scaled) / scale;
  return Number.isFinite(floored) && floored > 0 ? floored : 0;
}

/**
 * Is there anything to deposit at all?
 *
 * The companion to `checkDepositBalance`, and it exists because of a
 * deliberate gap in it: that function SKIPS a side with nothing in it, since a
 * single-sided deposit leaves the other field empty and an empty field is not a
 * shortfall of zero. Correct for balances, and useless as a gate — an entirely
 * empty form reports `ok`, so Review was live with nothing typed and the flow
 * only refused three screens later in `ConfirmFlow`, after the LP had chosen a
 * shape, dragged a split and pressed a second button.
 *
 * `some`, not `every`: a two-sided form with one side filled is a legitimate
 * deposit, and `addLiquidityAcross` takes a zero array for the side that is not
 * being brought. Requiring both would refuse the single-sided case the rest of
 * this flow is built around.
 */
export function hasDepositAmount(needs: readonly DepositNeed[]): boolean {
  return needs.some((need) => Number.isFinite(need.amount) && need.amount > 0);
}
