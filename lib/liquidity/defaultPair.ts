import { findChain } from "@iter/deployments";

/**
 * Which pair the liquidity flow opens on.
 *
 * ## It used to be the string "ETH" and the string "USDC"
 *
 * `LiquidityFlow`'s props defaulted to `initialBase = "ETH"`, `initialQuote =
 * "USDC"`. On Arc Testnet there is no ETH — the chain's assets are SKHY, USDC,
 * BUCKO, DONUT and HOOPS — so the flow opened on a market that cannot exist,
 * `resolveRate` had nothing to resolve and printed "Current rate —", and the APR
 * lookup matched no pair and printed "—" too. Three symptoms, one hardcoded
 * default.
 *
 * ## The rule: the money side is the QUOTE
 *
 * A pool is priced as quote-per-base, so the quote is whatever the chain treats
 * as money and the base is the thing being priced.
 *
 *   quote = a stablecoin if the chain has one, otherwise the native coin
 *   base  = the native coin, unless that IS the quote, in which case the first
 *           other non-stable token
 *
 * The exception is not a special case bolted on — it is the same rule. On Arc
 * the gas asset IS USDC (`nativeCurrency.symbol` is literally "USDC"), so the
 * native coin and the stablecoin are one token. It cannot be both sides, and the
 * side it belongs on is the one it is: money. Hence USDC quotes and something
 * else bases.
 *
 * Worked through, on the two chains actually served:
 *
 * | chain | native | stable | opens on |
 * |---|---|---|---|
 * | Arc Testnet | USDC | USDC | SKHY / USDC |
 * | RISE Testnet | ETH | none | YEAST / ETH |
 * | a chain with both | ETH | USDC | ETH / USDC |
 *
 * The third row is the old hardcoded default, now derived rather than assumed —
 * which is the point: it stays right where it was right, and stops being wrong
 * everywhere else.
 */

/**
 * Symbols treated as money, in preference order.
 *
 * A LIST rather than a heuristic, because "is this a stablecoin" is not
 * something a client can derive: a token's symbol is chosen by whoever deployed
 * it, and this venue lets anyone mint a coin called USDC. The list only ever
 * decides which side of a DEFAULT a token lands on — a choice the user can
 * change in two clicks — so a counterfeit inheriting a default quote slot costs
 * nothing. Nothing downstream may treat membership here as a claim about value.
 */
const STABLE_SYMBOLS = ["USDC", "USDT", "DAI", "USDS", "PYUSD", "USDB", "USDbC", "FRAX"];

export function isStableSymbol(symbol: string): boolean {
  return STABLE_SYMBOLS.includes(symbol.toUpperCase());
}

/**
 * The chain's gas asset symbol, or undefined for a chain the build does not
 * carry. Read from the registry, never a hardcoded list — `utils/order.ts`'s
 * `isNativeSymbol` is such a list and has never contained USDC, so it does not
 * recognise Arc's gas asset at all.
 */
export function nativeSymbolFor(networkName: string | undefined): string | undefined {
  if (!networkName) return undefined;
  return findChain(networkName)?.nativeCurrency?.symbol;
}

export interface DefaultPair {
  base: string;
  quote: string;
}

/**
 * Pick the opening pair from the tokens this chain actually lists.
 *
 * Returns null when the chain lists fewer than two distinct symbols — there is
 * no pair to open on, and inventing one is what this function exists to stop.
 * The caller leaves the selection alone in that case rather than rendering a
 * market nobody can provide to.
 */
export function defaultPair(
  tokens: readonly { symbol: string }[],
  nativeSymbol: string | undefined,
): DefaultPair | null {
  const symbols: string[] = [];
  for (const token of tokens) {
    if (token.symbol && !symbols.includes(token.symbol)) symbols.push(token.symbol);
  }
  if (symbols.length < 2) return null;

  const has = (symbol: string | undefined): string | undefined =>
    symbol ? symbols.find((s) => s.toUpperCase() === symbol.toUpperCase()) : undefined;

  // Preference order comes from STABLE_SYMBOLS, not from the list, so a chain
  // carrying both USDC and USDT opens on USDC either way round.
  const stable = STABLE_SYMBOLS.map((s) => has(s)).find(Boolean);
  const native = has(nativeSymbol);

  const quote = stable ?? native ?? symbols[0];

  const isQuote = (s: string) => s.toUpperCase() === quote.toUpperCase();
  const base =
    (native && !isQuote(native) ? native : undefined) ??
    // Prefer a non-stable: on a chain with USDC and USDT, basing one stablecoin
    // against the other is a pool almost nobody wants to open on.
    symbols.find((s) => !isQuote(s) && !isStableSymbol(s)) ??
    symbols.find((s) => !isQuote(s));

  return base ? { base, quote } : null;
}

/** One symbol the URL asked for that this chain does not list. */
export interface HealedSymbol {
  asked: string;
  got: string;
}

export interface HealedPair {
  base: string;
  quote: string;
  /** Empty when nothing was REPLACED — an unset field being filled is not a swap. */
  healed: HealedSymbol[];
}

/**
 * Resolve a requested pair against what a chain actually lists.
 *
 * Split out of `LiquidityFlow`'s healing effect so the distinction this function
 * exists for can be pinned by a test: filling an EMPTY field is initialisation
 * and stays silent, whereas replacing a symbol the caller actually asked for is
 * reported, so the UI can say the pair changed instead of changing it silently.
 *
 * That silence is not hypothetical. `?base=TITER&quote=TUSD` rewrote itself to
 * ETH/USDC on RISE for a day: an unlisted quote token prices at 0, the gateway
 * proxy builds the token list from PRICED pairs only, and so both symbols were
 * missing from `known` here. Every layer reported success and the only visible
 * symptom was a URL that changed on its own.
 */
export function healPair(
  known: ReadonlySet<string>,
  requested: { base: string; quote: string },
  fallback: { base: string; quote: string },
): HealedPair {
  const healed: HealedSymbol[] = [];
  const resolve = (current: string, replacement: string) => {
    if (current && known.has(current)) return current;
    if (current) healed.push({ asked: current, got: replacement });
    return replacement;
  };
  return {
    base: resolve(requested.base, fallback.base),
    quote: resolve(requested.quote, fallback.quote),
    healed,
  };
}
