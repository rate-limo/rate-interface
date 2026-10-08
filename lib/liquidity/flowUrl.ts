import type { LiqMode } from "./types";

/**
 * The address the liquidity flow SHOULD be at, given what it is showing.
 *
 * The flow kept its pair and its mode in component state and never told the
 * URL. Three ways that was wrong, all silent:
 *
 *  - `/pool/new?base=X&quote=Y` — the link every row of the pool overview builds
 *    — opened on the chain's default pair, under an address naming X/Y;
 *  - picking another token, or flipping the order, left the old pair in the bar,
 *    so a reload or a shared link reopened a market the LP had moved off;
 *  - "Launch a pool" had no address at all: reload and it was "Provide" again.
 *
 * Only the keys this flow owns are touched. The path, a locale prefix, `chain`
 * and anything else riding along (`ref=`) come back exactly as they were.
 *
 * Returns null for "leave it": a side is still unknown, or nothing differs.
 */
export function flowUrl(
  href: string,
  state: { base: string; quote: string; mode: LiqMode },
): string | null {
  if (!state.base || !state.quote) return null;
  const url = new URL(href);
  url.searchParams.set("base", state.base);
  url.searchParams.set("quote", state.quote);
  if (state.mode === "launch") url.searchParams.set("mode", "launch");
  else url.searchParams.delete("mode");
  return url.href === href ? null : url.href;
}

/** `?mode=` as the flow reads it. Anything but an exact "launch" is provide. */
export function modeFromParam(value: string | undefined): LiqMode {
  return value === "launch" ? "launch" : "provide";
}
