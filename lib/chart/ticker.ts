import { buildChartTicker } from "@iter/types";

/**
 * The ticker to open a chart with for a pair or token row: its display symbol
 * qualified by its contract address (`id`).
 *
 * Duplicate tickers are allowed on the launchpad, so a bare symbol can name
 * two markets; the gateway refuses such a symbol rather than guess, and the
 * address is what picks the right one. A row without an id falls back to the
 * bare symbol, which still resolves while it is unique.
 */
export function chartTicker(row: { symbol?: string | null; id?: string | null }): string {
  const symbol = row.symbol ?? "";
  if (!symbol) return "";
  return row.id ? buildChartTicker(symbol, row.id) : symbol;
}
