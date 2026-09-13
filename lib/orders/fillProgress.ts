/**
 * How much of an order has filled, preferring the exact values over the floats.
 *
 * `amount` and `placed` are Postgres `real()` — float4, ~7 significant digits — and
 * `placed` is decremented once per fill, so its error compounds. That is how a live
 * order came to display as 100% filled: an order of 1.000000001 taking a 1.0 fill
 * stores 0 while a gigawei is still resting on chain.
 *
 * `amountBN`/`placedBN` carry the same two numbers as exact integers (migration
 * 0031). When both are present the ratio is computed in bigint and nothing rounds
 * until the very last step.
 *
 * They are null on orders placed before that migration, and absent entirely on a
 * frame from a broker that predates the wire slots. Both cases fall back to the
 * floats — which is the honest thing, because for those rows no exact history
 * exists and deriving one from the float would launder a drifted number.
 */

export type FillProgress =
  | { kind: "exact"; percent: number }
  | { kind: "approximate"; percent: number }
  /** No usable inputs — render an em-dash, never a zero. */
  | { kind: "unknown" };

/** Basis points of precision retained before converting to a JS number. */
const BPS = BigInt(10_000);

export function fillProgress(order: {
  amount?: number | null;
  placed?: number | null;
  amountBN?: string | null;
  placedBN?: string | null;
}): FillProgress {
  const exact = exactPercent(order.amountBN, order.placedBN);
  if (exact !== null) return { kind: "exact", percent: exact };

  const amount = Number(order.amount);
  const placed = Number(order.placed);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(placed)) {
    return { kind: "unknown" };
  }
  const percent = ((amount - placed) / amount) * 100;
  // A negative fill means placed > amount, which no sequence of fills produces --
  // it is drift or a missed event. Reporting 0.00% would hide exactly the defect
  // this module exists for.
  if (!Number.isFinite(percent) || percent < 0) return { kind: "unknown" };
  return { kind: "approximate", percent };
}

function exactPercent(amountBN?: string | null, placedBN?: string | null): number | null {
  if (!amountBN || placedBN == null) return null;
  let total: bigint;
  let resting: bigint;
  try {
    total = BigInt(amountBN);
    resting = BigInt(placedBN);
  } catch {
    return null;
  }
  if (total <= BigInt(0)) return null;
  // Clamped rather than rejected: `resting > total` cannot arise from fills, but a
  // clamp keeps a bad row rendering something sane, and the caller can still tell
  // the difference because a genuinely impossible row has no exact values at all.
  if (resting < BigInt(0)) resting = BigInt(0);
  if (resting > total) resting = total;

  // Ratio in bigint, scaled to basis points, so the only rounding is the final
  // division by 100 -- rather than the subtraction itself losing the remainder.
  return Number(((total - resting) * BPS) / total) / 100;
}

/**
 * What the Filled column shows.
 *
 * A row in the open-orders table is an order the chain has NOT cleared -- the broker
 * deletes it on `clear`/`OrderDusted` and nothing else -- so this must never claim
 * completion, however the arithmetic lands. `.toFixed(2)` rounds anything from
 * 99.995 up to "100.00", so that is where the display switches to `≈100%`.
 */
const ROUNDS_TO_HUNDRED = 99.995;

export function formatFillProgress(progress: FillProgress): {
  label: string;
  title?: string;
} {
  if (progress.kind === "unknown") {
    return {
      label: "—",
      title: "Fill progress is unavailable for this order. Its size on chain is unaffected.",
    };
  }
  if (progress.percent >= ROUNDS_TO_HUNDRED) {
    return {
      label: "≈100%",
      title:
        progress.kind === "exact"
          ? "Still open on chain, with a remainder too small to show at this precision."
          : "Still open on chain. The remaining size is smaller than the indexer can represent.",
    };
  }
  return {
    label: `${progress.percent.toFixed(2)}%`,
    title:
      progress.kind === "approximate"
        ? "Approximate: this order predates exact size tracking."
        : undefined,
  };
}
