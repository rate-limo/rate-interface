/**
 * MOCK launch data + the pure helpers the flow validates with.
 *
 * The helpers are real and permanent; only `mockLaunchExecution` is
 * illustrative, and it models AssetGenerator's ladder launch — admin-set quote
 * options and terms, a launch that lists the pair at startingMarketCap / supply,
 * and a receipt carrying only the dev-bought coins.
 */

import {
  COIN_DECIMALS,
  FEE_DENOM,
  LAUNCH_SUPPLY,
  type FieldErrors,
  type LaunchDraft,
  type LaunchExecution,
  type LaunchReceipt,
  type LaunchTerms,
  type QuoteOption,
  type TokenDraft,
  type UploadedLogo,
} from "./types";

const SYMBOL_RE = /^[A-Z][A-Z0-9]{1,10}$/;

/** Parse a user-typed amount ("1,000,000,000" → 1e9). NaN-safe: returns 0. */
export function parseAmount(input: string): number {
  const n = Number.parseFloat(input.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function fmtAmount(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Compact display for supply-sized numbers (1.2B, 340M, 15K). */
export function fmtCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return fmtAmount(n);
}

/** Rate display, matching the liquidity flow's precision ladder. */
export function fmtRate(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString();
  if (p >= 1) return p.toFixed(2);
  if (p > 0) return fmtPriceInput(p) || "0";
  return "0";
}

/** Plain-decimal text for the editable 1e8-scaled listing-price field. */
export function fmtPriceInput(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "";
  return price.toFixed(8).replace(/\.?0+$/, "");
}

/** A fee numerator on the contract's FEE_DENOM scale, as a percent string. */
export function fmtFee(numerator: number): string {
  const pct = (numerator / FEE_DENOM) * 100;
  return `${pct.toFixed(pct < 1 ? 2 : 2)}%`;
}

/**
 * Symbols already trading. A collision isn't fatal onchain — addresses are the
 * identity — but it is fatal to a user reading a market list, so the flow warns.
 */
const TAKEN = new Set(["ETH", "WETH", "WBTC", "USDC", "USDT", "MON", "ITER", "RATE"]);

export function isSymbolTaken(symbol: string): boolean {
  return TAKEN.has(symbol.trim().toUpperCase());
}

/**
 * Mirrors the contract's own checks: `EmptyMetadata` for a blank name or
 * symbol, `SupplyIsZero` for zero supply. Everything beyond that is a display
 * concern the contract does not care about.
 *
 * There is no decimals field: `Coin`'s constructor takes none, so every launch
 * is COIN_DECIMALS.
 */
export function validateToken(t: TokenDraft): FieldErrors {
  const errors: FieldErrors = {};
  const name = t.name.trim();
  const symbol = t.symbol.trim().toUpperCase();

  if (name.length < 2) errors.name = "Give the token a name — at least 2 characters.";
  else if (name.length > 40) errors.name = "Keep the name under 40 characters.";

  if (!symbol) errors.symbol = "A symbol is required.";
  else if (!SYMBOL_RE.test(symbol))
    errors.symbol = "2–11 characters, letters and digits, starting with a letter.";

  if (t.description.length > 300) errors.description = "Keep the description under 300 characters.";

  return errors;
}

/** The one market check: the chosen quote must be one the generator enables. */
export function validateMarket(quote: string, options: readonly QuoteOption[]): FieldErrors {
  if (!options.some((o) => o.address === quote)) {
    return { quote: "Pick a quote token the generator currently accepts." };
  }
  return {};
}

/** Quote per coin at the start: the admin-set starting market cap spread over the supply. */
export function startingPrice(supply: number, startingMarketCap: number): number {
  return supply > 0 ? startingMarketCap / supply : 0;
}

/**
 * Deterministic stand-in addresses, derived from the symbol so the same draft
 * always "deploys" to the same place.
 */
function mockAddress(seed: string): string {
  let h = 0x811c9dc5;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  return `0x${hex}${"7c2a9e14b03f5d61".repeat(2)}`.slice(0, 42);
}

/** Shorten an address/hash for display: 0x7c2a…9e14. */
export function shortHex(hex: string): string {
  return hex.length <= 12 ? hex : `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion:reduce)").matches;
    setTimeout(resolve, reduce ? Math.min(ms, 120) : ms);
  });

/** Illustrative quote options, shaped like `enabledQuoteTokens()` + `quoteOption(...)`. */
export const MOCK_QUOTE_OPTIONS: QuoteOption[] = [
  {
    symbol: "USDC",
    address: mockAddress("USDC"),
    decimals: 6,
    startingMarketCap: BigInt(5_000_000_000),
    minDevBuy: BigInt(5_000_000),
    graduationMarketCap: BigInt(25_000_000_000),
    startingTakerFee: 1_000_000,
  },
];

/** Illustrative generator terms. Every value is admin-set on the real contract. */
export const MOCK_TERMS: LaunchTerms = {
  launchFeeEth: 0.01,
  launchFeeSymbol: "ETH",
};

/**
 * The illustrative execution. `submit` hands back only the dev-bought coins:
 * the rest is in the ladder or held for graduation, as on chain.
 */
export const mockLaunchExecution: LaunchExecution = {
  async uploadLogo(): Promise<UploadedLogo> {
    await wait(700);
    // A digest-shaped value, not "". The claim is keyed on it, and an empty one
    // would let the mocked flow exercise a path the real service rejects.
    return { sha256: "0".repeat(64), logoURI: "" };
  },
  async claimLogo(): Promise<boolean> {
    await wait(400);
    return true;
  },
  async quoteOptions(_networkName: string | number): Promise<QuoteOption[]> {
    await wait(200);
    return MOCK_QUOTE_OPTIONS;
  },
  async terms(_networkName: string | number): Promise<LaunchTerms> {
    await wait(200);
    return MOCK_TERMS;
  },
  async submit(draft: LaunchDraft, _networkName: string | number): Promise<LaunchReceipt> {
    await wait(1400);
    const supply = LAUNCH_SUPPLY;
    const symbol = draft.token.symbol.toUpperCase();
    const quote = MOCK_QUOTE_OPTIONS[0]!;
    const paid = parseAmount(draft.market.devBuy);
    const price = startingPrice(supply, Number(quote.startingMarketCap) / 10 ** quote.decimals);
    return {
      coinAddress: mockAddress(`${symbol}:coin`),
      pairAddress: mockAddress(`${symbol}:pair`),
      txHash: "0x9a3f7b1c04e2d85a6f3b90c17e4d2a8b5c6019fe3d4a7b28c5901ef6a3b24b21",
      receivedSupply: price > 0 ? paid / price : 0,
      devBuyQuote: paid,
      logoURI: draft.token.logoPreview,
      // The mock runs no real claim; LaunchConfirm overwrites this with what
      // `claimLogo` actually returned.
      logoBound: null,
    };
  },
};

export { COIN_DECIMALS };
