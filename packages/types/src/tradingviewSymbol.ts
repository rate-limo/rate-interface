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

/**
 * Joins a display symbol to the contract address that actually identifies it:
 * `"NOVA/USDC@0xF264…F104"`.
 *
 * ## Why a ticker carries an address
 *
 * The launchpad deliberately does not block a duplicate ticker — anyone can
 * deploy another "NOVA", as on pump.fun — so a symbol names a *label*, not a
 * market. `spotPairs.symbol` and `spotTokens.symbol` are not unique, and a
 * lookup by symbol alone picked whichever row the database returned first:
 * the second NOVA's chart drew the first one's candles, with nothing raised.
 * On an EVM chain the contract address is the identity, so the ticker carries
 * it and the gateway resolves by address (the primary key) whenever it is present.
 *
 * "@" is safe for the same reasons ":" is for the market-cap suffix: it cannot
 * appear in a pair's "/" separator, and the parse below only accepts it when a
 * full 20-byte hex address follows, so a token whose on-chain symbol happens to
 * contain "@" still parses as a plain symbol.
 */
export const ADDRESS_SEPARATOR = "@";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export interface ParsedTradingViewSymbol {
  /** The token/pair symbol with the market-cap suffix and address stripped, e.g. "NOVA". */
  base: string;
  /** True when the original ticker named a market-cap series, not a price one. */
  isMarketCap: boolean;
  /**
   * The contract address the ticker was qualified with (pair address for a pair,
   * token address for a token), exactly as written — callers normalise it.
   * `null` for a bare symbol, which the gateway resolves by symbol and refuses
   * when more than one market shares it.
   */
  address: string | null;
}

/**
 * Splits a UDF ticker into its base symbol and whether it names the
 * market-cap variant. The single parse used by both `/symbols` and `/history`
 * on the gateway, and by anything on the client that needs to know what a
 * ticker it already has actually refers to.
 */
export function parseTradingViewSymbol(symbol: string): ParsedTradingViewSymbol {
  const isMarketCap = symbol.endsWith(MARKET_CAP_SUFFIX);
  const unsuffixed = isMarketCap ? symbol.slice(0, -MARKET_CAP_SUFFIX.length) : symbol;

  const cut = unsuffixed.lastIndexOf(ADDRESS_SEPARATOR);
  const candidate = cut >= 0 ? unsuffixed.slice(cut + 1) : "";
  if (cut > 0 && ADDRESS_PATTERN.test(candidate)) {
    return { base: unsuffixed.slice(0, cut), isMarketCap, address: candidate };
  }
  return { base: unsuffixed, isMarketCap, address: null };
}

/**
 * The ticker a chart should be opened with: the display symbol qualified by the
 * contract address that identifies it. `address` is the PAIR's address for a
 * pair symbol and the TOKEN's address for a token symbol. Wrap the result in
 * `buildMarketCapSymbol` for the market-cap series.
 */
export function buildChartTicker(symbol: string, address: string): string {
  return `${symbol}${ADDRESS_SEPARATOR}${address}`;
}

/**
 * The ticker with its address removed, market-cap suffix kept: what the live
 * bar stream is keyed by. The broker publishes `spotBar:<symbol>-<room>`, so a
 * qualified ticker has to be reduced to this before it names a topic.
 */
export function stripChartAddress(ticker: string): string {
  const { base, isMarketCap } = parseTradingViewSymbol(ticker);
  return isMarketCap ? `${base}${MARKET_CAP_SUFFIX}` : base;
}

/**
 * Builds the market-cap ticker for a token ticker: `"NOVA"` -> `"NOVA:MCAP"`,
 * and `"NOVA@0x…"` -> `"NOVA@0x…:MCAP"`. The inverse of `parseTradingViewSymbol`
 * for the token case.
 */
export function buildMarketCapSymbol(baseSymbol: string): string {
  return `${baseSymbol}${MARKET_CAP_SUFFIX}`;
}
