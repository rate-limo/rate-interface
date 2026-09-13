/**
 * The UDF ticker convention for a token's market-cap series, shared by
 * apps/gateway (which resolves `/tradingview/symbols` and `/tradingview/history`
 * off it) and apps/web (which builds the ticker it hands the TradingView widget).
 *
 * Everything in this module is pure — no database, no fetch — for the same
 * reason as ./support: one definition is what stops the two apps' notion of
 * "this is a market-cap ticker" from drifting apart.
 *
 * ## Why the separator can't be "/"
 *
 * `/history` and `/symbols` both decide pair-vs-token with
 * `symbol.includes("/")`. A slash-based suffix (e.g. "NOVA/MCAP") would route
 * the market-cap ticker into the PAIR branch — it would try to find a
 * `spotPairs` row named "NOVA/MCAP", find nothing, and answer unknown_symbol
 * forever. ":" cannot appear in a real `spotTokens.symbol` or `spotPairs.symbol`
 * (pair symbols use "/", token symbols don't use punctuation), so it can't
 * collide with anything real, and it needs no URL-encoding in a query string
 * (RFC 3986 allows ":" unescaped in the query component).
 */
export const MARKET_CAP_SUFFIX = ":MCAP";

export interface ParsedTradingViewSymbol {
  /** The token/pair symbol with the market-cap suffix stripped, e.g. "NOVA". */
  base: string;
  /** True when the original ticker named a market-cap series, not a price one. */
  isMarketCap: boolean;
}

/**
 * Splits a UDF ticker into its base symbol and whether it names the
 * market-cap variant. The single parse used by both `/symbols` and `/history`
 * on the gateway, and by anything on the client that needs to know what a
 * ticker it already has actually refers to.
 */
export function parseTradingViewSymbol(symbol: string): ParsedTradingViewSymbol {
  if (symbol.endsWith(MARKET_CAP_SUFFIX)) {
    return { base: symbol.slice(0, -MARKET_CAP_SUFFIX.length), isMarketCap: true };
  }
  return { base: symbol, isMarketCap: false };
}

/**
 * Builds the market-cap ticker for a base token symbol: `"NOVA"` -> `"NOVA:MCAP"`.
 * The inverse of `parseTradingViewSymbol` for the token-symbol case.
 */
export function buildMarketCapSymbol(baseSymbol: string): string {
  return `${baseSymbol}${MARKET_CAP_SUFFIX}`;
}
