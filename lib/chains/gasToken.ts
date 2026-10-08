/**
 * Chains that pay gas in a TIP-20 stablecoin instead of a native coin.
 *
 * Tempo has no gas coin at all. Fees are charged in a TIP-20 (PathUSD unless the
 * account picked another in Tempo's FeeManager), CALLVALUE/BALANCE read 0, and
 * `eth_getBalance` answers a fixed placeholder (~4.2e75) that exists only so legacy
 * tooling does not crash. Anything here that asks "can this account pay gas?" or
 * "what will gas cost?" must read THIS token on such a chain, never the native view:
 * the native balance always looks rich, so a native gas check never fires.
 *
 * `feeDecimals` is the scale of `gas * gasPrice`. On Tempo that product is in
 * 1e-18 dollars (90M gas at 1.2 gwei quoted as 0.108 TIP-20 on 2026-10-07), which is
 * NOT the token's own 6 decimals and not viem's placeholder nativeCurrency (6).
 */
export interface GasToken {
  address: `0x${string}`;
  symbol: string;
  /** The token's own decimals, for balances. */
  decimals: number;
  /** The decimals of `gas * gasPrice`, for fee estimates. */
  feeDecimals: number;
}

const TIP20_GAS: Record<number, GasToken> = {
  // Tempo Testnet (Moderato): PathUSD, the enshrined default fee token.
  42431: {
    address: "0x20c0000000000000000000000000000000000000",
    symbol: "PathUSD",
    decimals: 6,
    feeDecimals: 18,
  },
};

/** The TIP-20 a chain charges gas in, or null for a chain with a native gas coin. */
export function tip20GasToken(chainId: number | undefined): GasToken | null {
  if (chainId === undefined) return null;
  return TIP20_GAS[chainId] ?? null;
}

/**
 * Tempo's FeeManager precompile. `userTokens(account)` is the TIP-20 that account
 * chose to pay fees in, or the zero address when it never chose -- which means the
 * chain's default (PathUSD). Read back on Moderato 2026-10-07: code `0xef`, and
 * `userTokens` answers zero for accounts that never set one.
 */
export const TEMPO_FEE_MANAGER = "0xfeEC000000000000000000000000000000000000" as const;

export const feeManagerAbi = [
  {
    type: "function",
    name: "userTokens",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "setUserToken",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  { type: "error", name: "InvalidToken", inputs: [] },
  { type: "error", name: "InsufficientFeeTokenBalance", inputs: [] },
  { type: "error", name: "CannotChangeWithinBlock", inputs: [] },
] as const;

/** `setUserToken(address)` */
export const SET_USER_TOKEN_SELECTOR = "0xe7897444";

/**
 * The stablecoins an account may pay Tempo gas in: USD-currency TIP-20s with Fee AMM
 * liquidity. Read back on Moderato 2026-10-07 (`symbol()`, `currency()` = "USD";
 * `0x20c0…0004` and up answer nothing). PathUSD first: it is the protocol default.
 */
const FEE_TOKEN_OPTIONS: Record<number, GasToken[]> = {
  42431: [
    { address: "0x20c0000000000000000000000000000000000000", symbol: "PathUSD", decimals: 6, feeDecimals: 18 },
    { address: "0x20C0000000000000000000000000000000000001", symbol: "AlphaUSD", decimals: 6, feeDecimals: 18 },
    { address: "0x20C0000000000000000000000000000000000002", symbol: "BetaUSD", decimals: 6, feeDecimals: 18 },
    { address: "0x20C0000000000000000000000000000000000003", symbol: "ThetaUSD", decimals: 6, feeDecimals: 18 },
  ],
};

/** Every token this chain accepts gas in; empty for a chain with a native gas coin. */
export function feeTokenOptions(chainId: number | undefined): GasToken[] {
  if (chainId === undefined) return [];
  return FEE_TOKEN_OPTIONS[chainId] ?? [];
}

/** The listed fee token at `address` on this chain, if any (case-insensitive). */
export function feeTokenOption(chainId: number | undefined, address: string | undefined): GasToken | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  return feeTokenOptions(chainId).find((t) => t.address.toLowerCase() === lower) ?? null;
}

/**
 * The token a Tempo transaction is charged in, per the protocol's order: the
 * account's FeeManager choice; else, for a direct `transfer` of a USD TIP-20, that
 * token; else PathUSD. (A per-transaction `fee_token` would come first; this app
 * sends none.) Insufficient balance in it makes the transaction invalid -- it is
 * rejected, not paid from another token.
 */
export function chargedFeeToken(
  chainId: number | undefined,
  chosen: string | undefined,
  transferring?: string,
): GasToken | null {
  const fallback = tip20GasToken(chainId);
  if (!fallback) return null;
  const preferred = chosen && chosen.toLowerCase() !== ZERO ? chosen : undefined;
  if (preferred) return accountFeeToken(chainId, preferred, feeTokenOption(chainId, preferred) ?? undefined);
  return feeTokenOption(chainId, transferring) ?? fallback;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The token THIS account pays gas in: its FeeManager choice when it made one, else
 * the chain's default. Null on a chain with a native gas coin. A chosen token's
 * symbol and decimals come from the caller (read off the token); until they are
 * known it is labelled generically rather than as PathUSD, which it is not.
 */
export function accountFeeToken(
  chainId: number | undefined,
  chosen: string | undefined,
  meta?: { symbol?: string; decimals?: number },
): GasToken | null {
  const fallback = tip20GasToken(chainId);
  if (!fallback) return null;
  if (!chosen || chosen.toLowerCase() === ZERO || chosen.toLowerCase() === fallback.address.toLowerCase()) {
    return fallback;
  }
  const listed = feeTokenOption(chainId, chosen);
  if (listed && !meta?.symbol) return listed;
  return {
    address: chosen as `0x${string}`,
    symbol: meta?.symbol ?? "fee token",
    // Every fee-eligible TIP-20 is a USD stablecoin with 6 decimals; read when known.
    decimals: meta?.decimals ?? 6,
    feeDecimals: fallback.feeDecimals,
  };
}

/**
 * What to CALL the gas asset on screen: the TIP-20 on a chain with no gas coin, the
 * native coin's symbol elsewhere. Tempo's registry `nativeCurrency.symbol` is a
 * placeholder ("USD") that names no token anyone holds, so a label read straight from
 * it tells people to top up something that does not exist.
 *
 * Never "fix" this by renaming Tempo's `nativeCurrency` in deployments.json instead: a
 * matching symbol switches on native-unit reserve maths (DepositPanel's gas reserve
 * divides by `nativeCurrency.decimals`), which on Tempo is 10^12 off. Labels go through
 * here; amounts go through `chargedFeeToken` / `feeUnits`.
 */
export function gasSymbol(chainId: number | undefined, nativeSymbol: string | undefined): string | undefined {
  return tip20GasToken(chainId)?.symbol ?? nativeSymbol;
}

/**
 * The scale and name of a paid fee (`gasUsed * effectiveGasPrice`). On a native-gas
 * chain that is the native coin; on Tempo it is 1e-18 dollars of the token that was
 * charged -- `charged` when the caller knows it, else the chain default.
 */
export function feeUnits(
  chainId: number | undefined,
  native: { symbol: string; decimals: number } | undefined,
  charged?: GasToken | null,
): { symbol: string; decimals: number } | null {
  const tip20 = charged ?? tip20GasToken(chainId);
  if (tip20) return { symbol: tip20.symbol, decimals: tip20.feeDecimals };
  return native ? { symbol: native.symbol, decimals: native.decimals } : null;
}
