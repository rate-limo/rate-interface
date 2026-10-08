/**
 * Token-launch domain types, modelled on contracts/src/asset/AssetGenerator.sol.
 *
 * Rewritten 2026-10-02 for the ladder launch. One call,
 * `launch(name, symbol, supply, quote, devBuyQuote, lockMode)`:
 *
 *  - The starting price is the quote option's `startingMarketCap` / supply.
 *  - The creator must buy between `minDevBuy` and 10% of supply at that price.
 *    That is the only supply they receive.
 *  - 80% of supply rests as five sell orders (16% each) at market caps rising
 *    geometrically from `startingMarketCap` to `graduationMarketCap`. The rest
 *    is held, with every quote raised, until graduation. No pool position and
 *    no open bands until then.
 *  - Graduation is two permissionless `graduate(coin)` calls: the first, once
 *    all five asks have filled, ARMS it; the second, `GRADUATION_DELAY` (300s)
 *    later, seeds the pool with everything held and hands the creator fee and
 *    volatility control. `lockMode` decides that position's fate.
 *  - Before graduation: Meme volatility (100 bps), the quote's
 *    `startingTakerFee` (1%), makers 0. Market buys cannot climb a step, so the
 *    interface buys a launch coin with LIMIT orders until it graduates.
 *  - `Coin`'s constructor takes no decimals, so every coin is 18.
 */

export type LaunchStep = "token" | "market" | "confirm";

/** Fixed at deploy by `Coin`'s constructor — not a user choice. */
export const COIN_DECIMALS = 18;

/**
 * Every /create launch mints exactly this many coins — not a user choice
 * (decided 2026-10-02). The contract still takes a supply argument; creators who
 * want another supply use an auction or launch a pool. Fixing it is also what
 * makes the quote-token rule simple: a quote option is offered only if its
 * start market cap prices a 1B launch at or above the contract's floor.
 */
export const LAUNCH_SUPPLY = 1_000_000_000;
/** The same, as the text the supply-taking helpers parse. */
export const LAUNCH_SUPPLY_TEXT = "1000000000";

/** Step 1 — everything that describes the token. */
export interface TokenDraft {
  /** Rejected empty by the contract (`EmptyMetadata`). */
  name: string;
  symbol: string;
  description: string;
  website: string;
  x: string;
  /**
   * A local object URL for the picked file, used only for preview. The stored
   * URL comes back from the upload — the bytes have to live somewhere the
   * gateway can serve, and a blob: URL is per-tab.
   */
  logoPreview: string | null;
  logoName: string | null;
}

/**
 * A quote token the generator currently allows, mirroring
 * `AssetGenerator.QuoteOption` plus the symbol for display.
 *
 * Read from `enabledQuoteTokens()` / `quoteOption(quote)`. The creator picks one
 * of these; every other field on it is shown as a FACT, because the contract
 * takes them from admin configuration and ignores anything the caller thinks.
 */
export interface QuoteOption {
  symbol: string;
  address: string;
  /** The quote token's own decimals — 6 for USDC. Every raw amount below is in them. */
  decimals: number;
  /** What the WHOLE supply is worth at the starting price, raw quote units. */
  startingMarketCap: bigint;
  /** The smallest dev buy the contract accepts, raw quote units. */
  minDevBuy: bigint;
  /** The ladder's top step: the market cap at which the last ask fills, raw quote units. */
  graduationMarketCap: bigint;
  /** `FEE_DENOM`-scaled taker fee every coin listed against this quote starts on. */
  startingTakerFee: number;
}

/**
 * `AssetGenerator.LockMode`. What happens to the pool position graduation creates:
 * 0 — the principal never leaves, the creator collects its fees forever;
 * 1 — the principal vests to the creator linearly over 365 days from graduation.
 */
export type LockMode = "feesOnly" | "vest12Months";
export const LOCK_MODE_INDEX: Record<LockMode, number> = { feesOnly: 0, vest12Months: 1 };

/** Step 2 — which quote, and how much of it the creator spends on the dev buy. */
export interface MarketDraft {
  /** Address of the chosen QuoteOption. */
  quote: string;
  /** Raw input in the quote token, commas allowed. */
  devBuy: string;
  /** Chosen on Confirm; null until then, and the launch refuses without it. */
  lockMode: LockMode | null;
}

/**
 * Generator-wide terms, all admin-set and read from the contract.
 *
 * These are shown, never entered. Modelling them as data rather than constants
 * is what keeps the UI honest when an operator retunes them.
 */
export interface LaunchTerms {
  /** Native-currency fee per launch. Zero is valid and means launching is free. */
  launchFeeEth: number;
  /**
   * The chain's gas asset the fee is paid in — ETH on RISE, USDC on Arc. Read
   * from the registry, never assumed: on Arc the native coin IS USDC.
   */
  launchFeeSymbol: string;
  /**
   * True where the fee is taken in the launch's quote token (approved with the dev
   * buy) instead of attached as native value -- Tempo, which has no native coin.
   */
  feeInQuote?: boolean;
  /** True where the generator places the ladder in a second transaction (Tempo). */
  ladderDeferred?: boolean;
}

/** `AssetGenerator.FEE_DENOM` — 1% is 1_000_000, 0.1% is 100_000. */
export const FEE_DENOM = 100_000_000;

/** Fixed for every coin until it graduates — `AssetGenerator`'s launch defaults. */
export const LAUNCH_VOLATILITY_BPS = 100;
/** `AssetGenerator.GRADUATION_DELAY`: seconds between arming and finishing graduation. */
export const GRADUATION_DELAY_SEC = 300;

export interface LaunchDraft {
  token: TokenDraft;
  market: MarketDraft;
}

/**
 * `ladder` is the two-transaction case: the coin is live and the price ladder
 * is not, so it is neither a failure (nothing can be retried -- a retry would
 * launch a second coin) nor a success (nothing is for sale). See
 * `lib/launch/ladderRecovery`.
 */
export type LaunchPhase =
  | "review"
  | "uploading"
  | "deploying"
  | "binding"
  | "ladder"
  | "pending"
  | "done";

/**
 * What `/token-logo` gives back. BOTH fields are load-bearing.
 *
 * `logoURI` is where the bytes live; `sha256` is what the claim is made over —
 * the nonce is issued for a (tokenId, sha256) pair and the signed message names
 * both, so the digest cannot be swapped after the wallet prompt. Returning only
 * the URL, as this did, meant the caller had nothing to claim WITH, which is one
 * of the two reasons uploaded artwork never reached a token.
 */
export interface UploadedLogo {
  sha256: string;
  logoURI: string;
}

export interface LaunchReceipt {
  /** Checksummed address of the deployed Coin. */
  coinAddress: string;
  /** The pair `addPair` returned. */
  pairAddress: string;
  txHash: string;
  /** Coins the dev buy delivered, from the `DevBuy` event. The rest is in the ladder or held. */
  receivedSupply: number;
  /** Quote the creator paid for them, from the same event. */
  devBuyQuote: number;
  /** Where the logo bytes ended up — null when no logo was picked. */
  logoURI: string | null;
  /**
   * Whether the logo was actually BOUND to the coin, not merely uploaded.
   *
   * Null when there was no logo to bind. False means the upload succeeded and
   * the claim did not, which is a state the creator can act on — the bytes are
   * stored and the signature can be retried — and one the confirmation screen
   * has to be honest about rather than showing artwork nobody else will see.
   */
  logoBound: boolean | null;
}

/**
 * The single wiring seam. Swapping the mock for a real AssetGenerator call plus a
 * metadata POST changes nothing in the components.
 *
 * `networkName` is threaded into every chain-reading/writing method rather than
 * read off the connected wallet's ambient chain. `useQuoteOptions.tsx` already
 * documents why: a bare `usePublicClient()` follows the connected wallet (or the
 * first configured chain when nothing is connected), which made a RISE token
 * profile viewed by a disconnected visitor silently read against another
 * chain's RPC. Pinning to the page's own network, the same way that hook does,
 * is what keeps a disconnected visitor's preview honest and keeps `submit`
 * targeting the generator the page is actually about instead of whatever chain
 * the wallet happens to be on.
 */
export interface LaunchExecution {
  /** Upload the logo bytes. Returns the digest to claim with and the URL it is served at. */
  uploadLogo(file: File): Promise<UploadedLogo>;
  /**
   * Bind an uploaded image to a coin the connected wallet launched.
   *
   * Prompts for a signature: admin-service issues a nonce over (tokenId, sha256),
   * the wallet signs the message naming both, and the recovered address is
   * checked against `spotTokens.creator` — so the authority comes from the chain
   * event rather than from anything the browser says. Writes
   * `adminTokenMeta.logoURI`, which the gateway merges over the broker's row.
   *
   * Resolves false rather than throwing when the bind does not happen: the coin
   * is already deployed by this point, and a failed signature must not read as a
   * failed launch.
   */
  claimLogo(tokenId: string, sha256: string, networkName: string | number): Promise<boolean>;
  /** `enabledQuoteTokens()` plus each one's `quoteOption(...)`, for `networkName`. */
  quoteOptions(networkName: string | number): Promise<QuoteOption[]>;
  /** Launch fee read from the generator on `networkName`; graduation targets come from the backend. */
  terms(networkName: string | number): Promise<LaunchTerms>;
  /**
   * Approve the dev buy's quote to the generator (exact amount), then
   * `AssetGenerator.launch(name, symbol, initialSupply, quote, devBuyQuote, lockMode)`
   * with the launch fee attached, on `networkName`.
   */
  submit(draft: LaunchDraft, networkName: string | number): Promise<LaunchReceipt>;
}

export interface FieldErrors {
  [field: string]: string | undefined;
}
