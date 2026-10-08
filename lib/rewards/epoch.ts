/**
 * The real rewards epoch grid, as the backend computes it.
 *
 * `lib/rewards/types.ts` had `epochEndsAt`, derived independently as "the next
 * Monday 00:00 UTC" and labelled a mock. The epoch NUMBER came from
 * `rewardsData().epoch`, a hardcoded `9`.
 *
 * Those are two different kinds of wrong:
 *
 * - **The boundary was accidentally right.** `GENESIS_EPOCH_START` is
 *   2026-01-05, which is a Monday, and epochs are exactly one week — so a grid
 *   anchored on the genesis and a grid anchored on "next Monday" land on the
 *   same instants. Verified: both give 2026-08-10T00:00:00Z for 2026-08-08.
 * - **The number was not.** On 2026-08-08 the real epoch is **30**. The status
 *   bar's "Next beat" tooltip and the rewards page were naming epoch 9 — a
 *   21-week-old constant — beside a countdown that was correct.
 *
 * Deriving both from the genesis is what stops them disagreeing again. The
 * constants mirror `apps/admin-service/src/point/epoch.ts` and
 * `apps/broker/src/point/epoch.ts`, which already duplicate each other for
 * their own reasons; this is the third copy and the same trade-off applies —
 * the arithmetic is four lines and a shared package for it would couple a
 * client bundle to a server one.
 *
 * `epochOf` is NOT fetched. It is deterministic from the clock, so a network
 * round trip would add failure modes to a subtraction.
 */

/** Monday 2026-01-05 00:00:00 UTC — epoch 0 begins here. */
export const GENESIS_EPOCH_START = Date.UTC(2026, 0, 5, 0, 0, 0, 0);
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Epochs per season, mirroring the backend's season arithmetic. */
export const EPOCHS_PER_SEASON = 12;

/**
 * Zero-based epoch containing `at`.
 *
 * Takes the instant as an argument rather than reading the clock, so it stays
 * pure and testable and the caller keeps hydration control — countdowns must
 * compute their target in an effect, never during render.
 */
export function epochOf(at: Date): number {
  return Math.floor((at.getTime() - GENESIS_EPOCH_START) / WEEK_MS);
}

/** Start of a given epoch, as a UTC instant. */
export function epochStart(epoch: number): Date {
  return new Date(GENESIS_EPOCH_START + epoch * WEEK_MS);
}

/**
 * End of the epoch containing `now` — equivalently, the start of the next one.
 *
 * Replaces the hand-rolled "next Monday" version. Same answer for every instant
 * after the genesis, but tied to the grid the backend actually uses, so a change
 * to the epoch length or anchor moves both together instead of silently
 * splitting the countdown from the epoch it counts down to.
 */
export function epochEndsAt(now: Date): Date {
  return epochStart(epochOf(now) + 1);
}

/** 1-based season number for an epoch, matching the backend's `seasonOf`. */
export function seasonOf(epoch: number): number {
  return Math.floor(epoch / EPOCHS_PER_SEASON) + 1;
}

/**
 * When the season containing `now` ends — the instant its $RATE is distributed.
 *
 * Season N spans epochs 12(N-1) … 12N-1, so it ends at the start of epoch 12N.
 * That boundary is what users are told, not the backend's close: the close runs
 * a few minutes after it (Monday 00:42 UTC) and may defer until the last week is
 * credited, and neither is a date anyone can plan around.
 */
export function seasonEndsAt(now: Date): Date {
  return epochStart(seasonOf(epochOf(now)) * EPOCHS_PER_SEASON);
}
