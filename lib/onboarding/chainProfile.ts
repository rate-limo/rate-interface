import { findChain } from "@iter/deployments";
import { gasSymbol } from "@/lib/chains/gasToken";

/**
 * What a chain offers a new user, and what it asks of them first.
 *
 * ## Derive the steps, declare the pitch
 *
 * Almost everything an onboarding card needs is already in the deployment
 * registry — the gas asset, whether a coin can be launched here, whether a
 * presale can. Deriving those keeps the card honest for free: it can only be
 * wrong if the deployment is, and it follows a redeploy without anyone editing
 * copy. `assetGenerator` was absent on Arc for most of a month; a card offering
 * "launch a coin" there would have pointed at a contract that did not exist.
 *
 * What no contract can tell us is what a chain is FOR. That is the `pitch`, and
 * it is the entire editorial surface: one line per chain.
 *
 * ## `quoteWrapsNative` now comes from the registry
 *
 * It is load-bearing: `addPair` creates a Pool only when NEITHER leg is a
 * wrapped native, so a chain quoted in WETH has no pools at all and no LP step
 * can ever be completed there. Verified rather than assumed — every RISE market
 * in the 2026-09-07 seed logs `band liquidity no pool`, while Arc's provided.
 *
 * It lived as a constant in this file because the registry recorded the quote's
 * ADDRESS and the gas asset but nothing saying whether the first wraps the
 * second. It is a property of the DEPLOYMENT — it changes only when a chain is
 * redeployed against a different quote — so it now sits in `deployments.json`
 * beside the other deployment facts, where `verify.mjs` can check it against the
 * chain the way it already checks addresses and fee config.
 *
 * That leaves `pitch` as the only written field in this module.
 */

/** The action a chain leads with — what its card is actually selling. */
export type ChainHeadline = "trade" | "launch" | "lp";

export interface ChainOnboardingProfile {
  chainId: number;
  name: string;
  /** From the registry. Names the asset that pays fees — USDC on Arc, ETH on RISE. */
  gasSymbol: string;
  /** True when the quote is the wrapped native, which is what forbids pools. */
  quoteWrapsNative: boolean;
  /** Derived: a launch needs the generator to exist on this chain. */
  canLaunch: boolean;
  /** Derived: a presale needs its own contract. */
  canAuction: boolean;
  /** Derived: a pool factory, AND a quote that is not the wrapped native. */
  canProvideLiquidity: boolean;
  /**
   * Derived: gas and quote are one asset, so a single top-up makes the account
   * able to trade. True exactly when the quote does not wrap the native.
   */
  fundingIsOneAsset: boolean;
  /** DECLARED. One line, in the operator's voice. */
  pitch: string;
  headline: ChainHeadline;
}

/**
 * The written half, keyed by chain id.
 *
 * A chain missing from here still gets a card — see `chainOnboardingProfile`'s
 * fallback — because a new deployment appearing with no card is worse than one
 * with a generic line. The fallback is deliberately plain, so it reads as
 * unfinished rather than as a claim nobody made.
 */
const DECLARED: Record<number, { pitch: string; headline: ChainHeadline }> = {
  // Arc: gas and quote are both native USDC, so there is nothing to wrap and one
  // faucet makes an account trade-ready. Pools exist here.
  5042002: {
    pitch: "Trade in USDC with nothing to wrap, and provide liquidity to earn fees.",
    headline: "trade",
  },
  // RISE: gas is ETH, quote is WETH. Two assets and a wrap, and no pools at all.
  11155931: {
    pitch: "Order-book trading quoted in ETH, with the deepest books on Rate.",
    headline: "trade",
  },
  // Monad and Robinhood: gas in the native coin, markets quoted in USDC, so pools
  // exist (a USDC leg is not the engine's WETH).
  10143: {
    pitch: "Trade on Monad with markets quoted in USDC, and provide liquidity to earn fees.",
    headline: "trade",
  },
  46630: {
    pitch: "Trade on Robinhood Chain with markets quoted in USDC, and provide liquidity to earn fees.",
    headline: "trade",
  },
  // Tempo: no gas coin at all. Fees and markets are both in PathUSD, so there is
  // nothing to wrap, and pools exist.
  42431: {
    pitch: "Trade on Tempo with fees and markets in PathUSD, and provide liquidity to earn fees.",
    headline: "trade",
  },
};

export function chainOnboardingProfile(chainId: number): ChainOnboardingProfile | null {
  const chain = findChain(chainId);
  if (!chain) return null;

  const contracts = (chain.contracts ?? {}) as Record<string, unknown>;
  const has = (key: string): boolean => {
    const entry = contracts[key];
    const address = typeof entry === "string" ? entry : (entry as { address?: string })?.address;
    return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address);
  };

  // From the chain's own config. Absent means the quote is a plain token, which
  // is the ordinary case and the safe default: it enables an LP step, and an LP
  // step on a chain that turns out to have no pool is visible immediately, where
  // a missing one is invisible forever.
  const quoteWrapsNative =
    (chain.config as { quoteWrapsNative?: boolean } | undefined)?.quoteWrapsNative === true;

  const declared = DECLARED[chainId];

  return {
    chainId,
    name: chain.name,
    // Tempo's registry symbol is a placeholder ("USD"); its gas is PathUSD.
    gasSymbol: gasSymbol(chainId, chain.nativeCurrency?.symbol) ?? "gas",
    quoteWrapsNative,
    canLaunch: has("assetGenerator"),
    canAuction: has("presaleLaunch"),
    canProvideLiquidity: has("bandPoolFactory") && !quoteWrapsNative,
    fundingIsOneAsset: !quoteWrapsNative,
    pitch: declared?.pitch ?? `Trade on ${chain.name}.`,
    headline: declared?.headline ?? "trade",
  };
}

/**
 * The steps this chain actually has, in order.
 *
 * Never includes a step that cannot be completed here. That is the rule
 * `lib/errors/insufficientGas.ts` already states for the gas asset — telling
 * someone to "add ETH" while they hold Arc USDC asks for something impossible —
 * and an LP step on a chain with no pools is the same error one level up.
 */
export type ChainStepKey = "wallet" | "fund" | "wrap" | "trade" | "launch" | "lp";

export function chainSteps(profile: ChainOnboardingProfile): ChainStepKey[] {
  const steps: ChainStepKey[] = ["wallet", "fund"];
  // Only where the quote is not what pays for gas. On Arc this step does not
  // exist rather than being pre-completed: a tick beside something the chain
  // never asked for still tells the reader it was a requirement.
  if (profile.quoteWrapsNative) steps.push("wrap");
  steps.push(profile.headline === "launch" && profile.canLaunch ? "launch" : "trade");
  if (profile.canProvideLiquidity) steps.push("lp");
  return steps;
}

/** What each step says, given the chain it belongs to. */
export function stepLabel(step: ChainStepKey, profile: ChainOnboardingProfile): string {
  switch (step) {
    case "wallet":
      return "wallet";
    case "fund":
      return `get ${profile.gasSymbol}`;
    case "wrap":
      return `wrap ${profile.gasSymbol}`;
    case "trade":
      return "first trade";
    case "launch":
      return "launch a coin";
    case "lp":
      return "provide liquidity";
  }
}
