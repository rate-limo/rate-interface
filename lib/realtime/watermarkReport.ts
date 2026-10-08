/** Parses a tab's watermark counters report — see app/api/watermark-report. Trusts nothing. */
const MAX_CHAINS = 16;
const KINDS = ["retried", "refused", "healed"] as const;

export function parseWatermarkReport(payload: unknown): Record<string, Record<(typeof KINDS)[number], number>> {
  const out: Record<string, Record<(typeof KINDS)[number], number>> = {};
  const counts = (payload as { counts?: unknown } | null)?.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return out;
  for (const [chain, value] of Object.entries(counts).slice(0, MAX_CHAINS)) {
    if (!/^[\w .-]{1,48}$/.test(chain) || !value || typeof value !== "object") continue;
    const row = { retried: 0, refused: 0, healed: 0 };
    for (const kind of KINDS) {
      const n = (value as Record<string, unknown>)[kind];
      if (typeof n === "number" && Number.isSafeInteger(n) && n >= 0) row[kind] = Math.min(n, 1_000_000);
    }
    if (row.retried + row.refused + row.healed > 0) out[chain] = row;
  }
  return out;
}
