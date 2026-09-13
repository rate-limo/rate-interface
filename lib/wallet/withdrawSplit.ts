/**
 * Splitting a withdrawal between the destination and the fee wallet.
 *
 * Pure bigint, no chain, no clock. This is the part whose failure moves money
 * to the wrong place, so it is a module with tests rather than three lines
 * inside a component — the same call `graduation.ts`'s `decide` and
 * `referral.ts`'s `decideLink` make about their own rules.
 *
 * ## The arithmetic rule that matters
 *
 * `rest` is `amount - fee`, NEVER `amount * 9_999 / 10_000`.
 *
 * Two independent divisions each truncate, and the pair then does not sum to
 * `amount`: a withdrawal of 3 would compute fee 0 and rest 2, quietly leaving
 * 1 unit behind on every call. Deriving one side by subtraction makes
 * `fee + rest === amount` true by construction rather than by luck, and every
 * case in the test asserts it.
 *
 * ## Truncation means small withdrawals pay nothing, deliberately
 *
 * 0.01% is 1 basis point, so `fee = amount / 10_000` and anything below
 * 10,000 base units yields zero. For 6-decimal USDC that is any withdrawal
 * under 0.01 USDC; for 18-decimal ETH it is dust nobody would send.
 *
 * The alternative — rounding up to a floor of 1 unit — is worse where it
 * differs: on a 1-unit transfer it is a 100% fee. Waiving is the honest
 * direction, and `FEE_WAIVED_BELOW` names the boundary so a UI can say so
 * instead of showing "fee: 0" and looking broken.
 *
 * ## What this does NOT decide
 *
 * Whether the fee should be charged at all, or to whom. The caller supplies the
 * fee wallet; an unset one is refused rather than defaulted, because a
 * zero-address fee recipient is a burn and a wrong one is someone else's money.
 */

/*
 * `BigInt(1)` rather than `1n` throughout this file and its sibling.
 *
 * apps/web compiles at `target: ES2017` and bigint LITERALS need ES2020, so
 * `1n` does not typecheck here — it is a 76-error build, not a style
 * preference. `lib/orders/fillProgress.ts` already writes `BigInt(10_000)` for
 * the same reason and there is not one `0n` anywhere else in `lib/`.
 *
 * Raising the target would work and is a repo-wide change with its own
 * consequences; matching the existing convention costs nothing.
 */

/** 0.01%, in basis points. `1 bps = 0.01%, 10000 bps = 100%`. */
export const FEE_BPS = BigInt(1);

/** Denominator for basis points. */
export const BPS_DENOMINATOR = BigInt(10_000);

/**
 * Below this many base units the fee truncates to zero.
 *
 * Exported so the UI can explain the zero rather than render it as a number
 * that looks like a bug. Equal to `BPS_DENOMINATOR / FEE_BPS`.
 */
export const FEE_WAIVED_BELOW = BPS_DENOMINATOR / FEE_BPS;

export interface WithdrawSplit {
  /** Goes to the destination the user typed. */
  rest: bigint;
  /** Goes to the fee wallet. Zero below `FEE_WAIVED_BELOW`. */
  fee: bigint;
  /** True when truncation, not policy, made the fee zero. */
  feeWaived: boolean;
}

export class WithdrawSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawSplitError";
  }
}

/**
 * Split an amount into what the destination receives and what the fee wallet
 * takes.
 *
 * Refuses a non-positive amount rather than returning a zero split: a
 * withdrawal of nothing is a mistake upstream, and answering it with `{0, 0}`
 * would let a UI render a confirmation for a transfer that does nothing.
 */
export function splitWithdrawal(amount: bigint): WithdrawSplit {
  if (amount <= BigInt(0)) {
    throw new WithdrawSplitError("A withdrawal must be greater than zero.");
  }

  const fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
  // Subtraction, not a second division. See the note above.
  const rest = amount - fee;

  return { rest, fee, feeWaived: fee === BigInt(0) };
}

/**
 * Every address a withdrawal must not be sent to, and why.
 *
 * `withdraw.ts` already refuses a send to the wallet it is leaving — that would
 * succeed, cost gas and change nothing. Taking a fee adds two more cases that
 * are just as silently wrong:
 *
 *  - **Destination equals the fee wallet.** The user's whole balance lands in
 *    the operator's wallet and the transfer looks successful.
 *  - **Fee wallet equals the sender.** The fee leg pays the user their own
 *    money back, costing gas to accomplish nothing — a misconfiguration that
 *    reads as working.
 *
 * Returns a sentence, or null when the pair is fine. A string rather than a
 * boolean because the caller has to say WHICH of these it is; "invalid address"
 * on a screen about to move funds is not a useful thing to tell someone.
 */
export function rejectWithdrawal(args: {
  from: string | undefined;
  to: string;
  feeWallet: string | undefined;
}): string | null {
  const norm = (v: string | undefined) => v?.trim().toLowerCase() ?? "";
  const from = norm(args.from);
  const to = norm(args.to);
  const feeWallet = norm(args.feeWallet);

  if (!feeWallet) {
    // Refused, never defaulted. A zero-address recipient burns the fee and a
    // wrong one is somebody else's money; both are worse than not withdrawing.
    return "Withdrawals are unavailable: no fee wallet is configured.";
  }
  if (to && from && to === from) {
    return "That is the wallet you are withdrawing from.";
  }
  if (to && to === feeWallet) {
    return "That address is the fee wallet, not a withdrawal destination.";
  }
  if (from && from === feeWallet) {
    return "This wallet is configured as the fee wallet, so a fee split would pay itself.";
  }
  return null;
}
