/**
 * A launched coin's onchain controls, as the Creator tab shows them: the sell
 * ladder, graduation, the creator's fee and volatility, and the pool position
 * graduation creates.
 *
 * Read from `AssetGenerator` (see hooks/useCoinLaunch). The rules are the
 * contract's, restated so the buttons are disabled for exactly the cases the
 * transaction would revert on:
 *
 *  - The ladder is five resting asks. A step counts as SOLD once its order slot
 *    no longer holds an escrow-owned deposit (`AssetLaunchLib.requireFilled`).
 *  - Graduation is two permissionless `graduate(coin)` calls. The first, once
 *    all five are sold, ARMS it (`readyAt = now + GRADUATION_DELAY`); the second,
 *    from `readyAt` on, finishes it. It latches.
 *  - Fee and volatility are the creator's only after graduation, unless an admin
 *    has locked them (`creatorFeeLocked`) — a different reason, said differently.
 *  - The pool position exists only after graduation. Fees are collectable any
 *    time; under `vest12Months` the principal vests linearly over 365 days from
 *    `graduatedAt` and is released with `releaseVested`. Under `feesOnly` it
 *    never leaves.
 *
 * This is NOT the "List" control above it in the tab. Listing is admin-service
 * flipping `spotPairs.verified` on quote TVL; graduation is this contract call.
 * The two never share a verb.
 */

export type LockModeName = "feesOnly" | "vest12Months";

export interface CoinLaunchState {
  creator: string;
  quote: string;
  quoteSymbol: string;
  quoteDecimals: number;
  graduated: boolean;
  creatorFeeLocked: boolean;
  takerFeeNum: number;
  slippageLimitBps: number;
  /** Which of the five steps have sold, in order. */
  stepsSold: boolean[];
  /** Quote held by the launch escrow: the dev buy plus every ladder fill, raw units. */
  quoteRaised: bigint;
  graduationMarketCap: bigint;
  /** Unix seconds when the armed graduation may finish; 0 when not armed. */
  readyAt: number;
  graduatedAt: number;
  lockMode: LockModeName;
  /** Share of the original position already released, basis points. */
  releasedBps: number;
  maxCreatorTakerFeeNum: number;
  minFeeNum: number;
  minVolatilityBps: number;
  maxVolatilityBps: number;
}

/** `AssetLaunchLib.VEST_DURATION`. */
export const VEST_DURATION_SEC = 365 * 24 * 60 * 60;

export type GraduationStatus = "selling" | "armable" | "armed" | "ready" | "graduated";

export function graduationStatus(
  s: Pick<CoinLaunchState, "graduated" | "stepsSold" | "readyAt">,
  nowSec: number,
): GraduationStatus {
  if (s.graduated) return "graduated";
  if (s.readyAt > 0) return nowSec >= s.readyAt ? "ready" : "armed";
  return s.stepsSold.length > 0 && s.stepsSold.every(Boolean) ? "armable" : "selling";
}

export function stepsSoldCount(s: Pick<CoinLaunchState, "stepsSold">): number {
  return s.stepsSold.filter(Boolean).length;
}

export type ControlBlock = "not-graduated" | "locked" | null;

/** Why the creator cannot retune right now, or null when they can. */
export function controlBlockedBy(s: Pick<CoinLaunchState, "graduated" | "creatorFeeLocked">): ControlBlock {
  if (!s.graduated) return "not-graduated";
  if (s.creatorFeeLocked) return "locked";
  return null;
}

/** `AssetLaunchLib.releaseVested`'s vested share, basis points, at `nowSec`. */
export function vestedBps(graduatedAt: number, nowSec: number): number {
  if (graduatedAt <= 0) return 0;
  const elapsed = Math.max(0, nowSec - graduatedAt);
  return elapsed >= VEST_DURATION_SEC ? 10_000 : Math.floor((elapsed * 10_000) / VEST_DURATION_SEC);
}

/** Whether `releaseVested` would release anything now (it reverts `NothingToRelease` otherwise). */
export function canReleaseVested(s: Pick<CoinLaunchState, "graduated" | "lockMode" | "graduatedAt" | "releasedBps">, nowSec: number): boolean {
  return s.graduated && s.lockMode === "vest12Months" && vestedBps(s.graduatedAt, nowSec) > s.releasedBps;
}

/** Raw quote units as a number in whole tokens, for display only. */
export function quoteAmount(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}
