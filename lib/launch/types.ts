/**
 * Token-launch domain types, modelled on contracts/src/asset/AssetGenerator.sol.
 *
 * Rewritten 2026-08-01 when AssetGenerator replaced the MemeassetGenerator sketch.
 * The earlier version was designed against an intended flow rather than a
 * contract, and got four things wrong that this file now follows:
 *
 *  - `launch()` deploys, lists the pair and hands the creator the remaining
 *    supply. It places NO orders and opens NO position, so there is no range,
 *    no seeding and no Seed step.
 *  - Quote options provide a default starting price; the launch flow can carry
 *    a creator-selected opening price as market configuration.
 *  - There are no fee tiers. The generator charges 1.00% taker before
 *    graduation and 0.10% after, and makers pay nothing.
 *  - `Coin`'s constructor takes no decimals, so every launched coin is the
 *    OpenZeppelin ERC-20 default of 18.
 *
 * Nothing here imports from lib/liquidity: a launch is not a liquidity position,
 * and the FeeTier it used to borrow does not apply.
 */

export type LaunchStep = "token" | "market" | "volatility" | "fee" | "liquidity" | "confirm";
export type LaunchProfile = "stable" | "standard" | "uniswap" | "meme";

/** Fixed at deploy by `Coin`'s constructor — not a user choice. */
export const COIN_DECIMALS = 18;

/** Step 1 — everything that describes the token. */
export interface TokenDraft {
  /** Rejected empty by the contract (`EmptyMetadata`). */
  name: string;
  symbol: string;
  /** Raw input; commas allowed. Rejected at zero by the contract (`SupplyIsZero`). */
  totalSupply: string;
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
  /**
   * Initial market price for the new pair, as the engine's 1e8-scaled rate,
   * already divided down for display. Quote per coin.
   */
  listingPrice: number;
  /**
   * What the MatchingEngine charges the listing cost in. `null` means the coin
   * itself — the contract's default, and why the creator receives their supply
   * net of the listing cost rather than in full.
   */
  listingPaymentSymbol: string | null;
  /** Backend-administered cumulative purchase target in this quote token. */
  graduationTargetQuote: number;
  /** Starting taker fee copied from AssetGenerator's quote option. */
  startingTakerFee: number;
}

/** Step 2 — the only thing the creator actually chooses about the market. */
export interface MarketDraft {
  /** Address of the chosen QuoteOption. */
  quote: string;
  /** Creator-selected initial quote-token price per new token. */
  listingPrice: number;
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
}

/** `AssetGenerator.FEE_DENOM` — 1% is 1_000_000, 0.1% is 100_000. */
export const FEE_DENOM = 100_000_000;

export interface LaunchDraft {
  token: TokenDraft;
  market: MarketDraft;
  risk: {
    volatilityProfile: LaunchProfile | "custom";
    slippagePct: number;
    feeProfile: LaunchProfile | "custom";
    feePct: number;
  };
  liquidity: LaunchLiquidityDraft | null;
  payment: {
    asset: "ETH";
  };
}

export interface LaunchLiquidityDraft {
  baseAmount: string;
  quoteAmount: string;
  low: number;
  high: number;
  fullRange: boolean;
  locked: boolean;
  lockDuration: "30 days" | "90 days" | "180 days" | "1 year";
}

export type LaunchPhase = "review" | "uploading" | "deploying" | "binding" | "pending" | "done";

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
  /** Supply actually received, i.e. minted supply minus the listing cost. */
  receivedSupply: number;
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
  /** `AssetGenerator.launch(name, symbol, initialSupply, quote)` on `networkName`. */
  submit(draft: LaunchDraft, networkName: string | number): Promise<LaunchReceipt>;
}

export interface FieldErrors {
  [field: string]: string | undefined;
}
