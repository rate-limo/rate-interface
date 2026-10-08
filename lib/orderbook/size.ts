/**
 * A size or total in a book column — one rule for the desktop ladder and the
 * phone book alike.
 *
 * Exact and grouped below a million (193,333 reads at a glance; 6 significant
 * figures keep a small total like 0.000135 from rounding to "0", the same bug
 * the price columns had). From a million up the column has no room for
 * 193,333,333.333, so it goes compact: 193M.
 */
import { compactNumber } from "@/lib/format/compact";
import { formatPrice } from "@/lib/format/price";

export const COMPACT_FROM = 1e6;

export function formatBookSize(value: number | string): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v) >= COMPACT_FROM ? compactNumber(v) : formatPrice(v, 6);
}
