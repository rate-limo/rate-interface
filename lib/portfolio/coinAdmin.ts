/**
 * The two CoinGenerator writes a creator can make from the portfolio.
 *
 * ## These are transactions, and nothing else in this tab is
 *
 * Everything else in the Creator tab is a read, plus `requestGraduation` — a POST that
 * deliberately carries no authority, because apps/web holds no key and the server
 * re-derives eligibility itself. These two are the opposite: real wallet signatures,
 * real gas, and the contract checks `msg.sender` against `launches[coin].creator`.
 *
 * So they need the review → confirm → pending → result machine the swap and launch flows
 * already have, not a fetch. This interface is the same seam as `LaunchExecution`: the
 * component is written against it, a mock implements it today, and wiring wagmi changes
 * nothing above the line.
 *
 * ## Errors are content, not noise
 *
 * `CoinGenerator` reverts with named errors, each of which maps to a sentence a creator
 * can act on. Collapsing them into "transaction reverted" throws away the only part of
 * the failure that helps. `describeCoinAdminError` is where that mapping lives.
 */

export type CoinAdminErrorKind =
  | "not-graduated"
  | "above-cap"
  | "locked"
  | "not-creator"
  | "requirement-not-met"
  | "requirement-not-set"
  | "already-graduated"
  | "rejected"
  | "unknown";

export class CoinAdminError extends Error {
  readonly kind: CoinAdminErrorKind;
  constructor(kind: CoinAdminErrorKind, message: string) {
    super(message);
    this.name = "CoinAdminError";
    this.kind = kind;
  }
}

/**
 * Turn a revert into a sentence.
 *
 * Matches on the custom error NAME rather than a selector: viem surfaces the decoded
 * name when the ABI is present, and a name survives a recompile that changes argument
 * types while a hand-copied selector does not.
 */
export function describeCoinAdminError(error: unknown): CoinAdminError {
  if (error instanceof CoinAdminError) return error;
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (/NotGraduatedYet/.test(raw)) {
    return new CoinAdminError("not-graduated", "This coin has to graduate before you can set its fee.");
  }
  if (/FeeAboveCreatorCap/.test(raw)) {
    return new CoinAdminError("above-cap", "That is above the ceiling Iter allows creators to set.");
  }
  if (/CreatorFeeControlLocked/.test(raw)) {
    return new CoinAdminError("locked", "An Iter operator has paused fee control for this coin.");
  }
  if (/NotTheCreator/.test(raw)) {
    return new CoinAdminError("not-creator", "Only the wallet that launched this coin can set its fee.");
  }
  if (/GraduationRequirementNotMet/.test(raw)) {
    return new CoinAdminError(
      "requirement-not-met",
      "Market cap is below the graduation requirement — the book has to price it higher first.",
    );
  }
  if (/GraduationRequirementNotSet/.test(raw)) {
    return new CoinAdminError("requirement-not-set", "Iter has not set a graduation requirement yet.");
  }
  if (/AlreadyGraduated/.test(raw)) {
    return new CoinAdminError("already-graduated", "This coin has already graduated.");
  }
  if (/User rejected|user rejected|denied transaction/.test(raw)) {
    return new CoinAdminError("rejected", "You rejected the signature — nothing was sent.");
  }
  return new CoinAdminError("unknown", "The transaction failed. Nothing was changed.");
}

export interface CoinAdminExecution {
  /** `CoinGenerator.graduate(coin)`. Resolves to the transaction hash. */
  graduate(coin: string): Promise<string>;
  /** `CoinGenerator.setPairTakerFee(coin, feeNum)`, feeNum on the 1e8 scale. */
  setTakerFee(coin: string, feeNum: number): Promise<string>;
}

/**
 * Mock. Applies the contract's own preconditions so the UI's disabled states are
 * exercised rather than assumed — a mock that always succeeds would hide exactly the
 * paths this flow exists to render.
 */
export function mockCoinAdmin(state: {
  feeGraduated: boolean;
  creatorFeeLocked: boolean;
  maxCreatorTakerFeeNum: number;
  eligible: boolean;
}): CoinAdminExecution {
  return {
    async graduate() {
      await new Promise((r) => setTimeout(r, 700));
      if (state.feeGraduated) throw new CoinAdminError("already-graduated", "This coin has already graduated.");
      if (!state.eligible) {
        throw new CoinAdminError(
          "requirement-not-met",
          "Market cap is below the graduation requirement — the book has to price it higher first.",
        );
      }
      state.feeGraduated = true;
      return "0xmock";
    },
    async setTakerFee(_coin, feeNum) {
      await new Promise((r) => setTimeout(r, 700));
      if (!state.feeGraduated) {
        throw new CoinAdminError("not-graduated", "This coin has to graduate before you can set its fee.");
      }
      if (state.creatorFeeLocked) {
        throw new CoinAdminError("locked", "An Iter operator has paused fee control for this coin.");
      }
      if (feeNum > state.maxCreatorTakerFeeNum) {
        throw new CoinAdminError("above-cap", "That is above the ceiling Iter allows creators to set.");
      }
      return "0xmock";
    },
  };
}
