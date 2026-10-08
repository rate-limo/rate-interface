/**
 * The `AssetGenerator` writes a creator can make from the portfolio.
 *
 * ## These are transactions, and the List control is not
 *
 * `requestGraduation` (lib/portfolio/graduate.ts) is a POST that carries no
 * authority — admin-service re-derives listing eligibility itself. These are the
 * opposite: real wallet signatures against the coin's own generator, which checks
 * `msg.sender` against `launches[coin].creator` (graduate excepted — anyone may
 * call it once the pool holds enough).
 *
 * ## Errors are content, not noise
 *
 * The generator reverts with named errors, each of which maps to a sentence a
 * creator can act on. Collapsing them into "transaction reverted" throws away
 * the only part of the failure that helps. `describeCoinAdminError` is where that
 * mapping lives; matching is by NAME, which viem surfaces when the ABI is
 * present, and which survives a recompile that changes argument types.
 */

import {
  getAccount,
  simulateContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { AssetGeneratorABI } from "@iter/abis";
import { chainIds } from "@/consts";
import { contractAddress } from "@/lib/deployments";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";

export type CoinAdminErrorKind =
  | "ladder-not-filled"
  | "not-ready"
  | "not-graduated"
  | "nothing-to-release"
  | "not-vesting"
  | "already-graduated"
  | "locked"
  | "above-cap"
  | "out-of-range"
  | "not-creator"
  | "rejected"
  | "unknown";

export class CoinAdminError extends Error {
  readonly kind: CoinAdminErrorKind;
  constructor(kind: CoinAdminErrorKind, message: string) {
    super(message);
    this.name = "CoinAdminError";
    this.kind = kind;
  }
}

/** Turn a revert into a sentence. */
export function describeCoinAdminError(error: unknown): CoinAdminError {
  if (error instanceof CoinAdminError) return error;
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (/LadderNotFilled/.test(raw)) {
    return new CoinAdminError("ladder-not-filled", "Not every sell step has sold yet, so graduation can't be armed.");
  }
  if (/GraduationNotReady/.test(raw)) {
    return new CoinAdminError("not-ready", "Graduation is armed but not ready yet. Try again when the countdown ends.");
  }
  if (/NotGraduated/.test(raw)) {
    return new CoinAdminError("not-graduated", "This coin hasn't graduated yet, so there is no pool position.");
  }
  if (/NothingToRelease/.test(raw)) {
    return new CoinAdminError("nothing-to-release", "Nothing new has vested since your last release.");
  }
  if (/NotVesting/.test(raw)) {
    return new CoinAdminError("not-vesting", "This coin's liquidity never unlocks. You can only collect its fees.");
  }
  if (/AlreadyGraduated/.test(raw)) {
    return new CoinAdminError("already-graduated", "This coin has already graduated.");
  }
  if (/CreatorFeeControlLocked/.test(raw)) {
    return new CoinAdminError(
      "locked",
      "Fee and volatility are locked for this coin. They unlock at graduation, unless an operator has locked them.",
    );
  }
  if (/FeeAboveCreatorCap/.test(raw)) {
    return new CoinAdminError("above-cap", "That fee is above the ceiling Rate allows creators to set.");
  }
  if (/FeeOutsidePairRange|InvalidVolatility|InvalidFee/.test(raw)) {
    return new CoinAdminError("out-of-range", "That fee or volatility is outside the range Rate allows.");
  }
  if (/NotTheCreator/.test(raw)) {
    return new CoinAdminError("not-creator", "Only the wallet that launched this coin can do that.");
  }
  if (/User rejected|user rejected|denied transaction/.test(raw)) {
    return new CoinAdminError("rejected", "You rejected the signature. Nothing was sent.");
  }
  return new CoinAdminError("unknown", "The transaction failed. Nothing was changed.");
}

export interface CoinAdminExecution {
  /**
   * `graduate(coin)`. Anyone may call it, twice: the first call ARMS it once all
   * five ladder steps have sold, the second finishes it `GRADUATION_DELAY` later.
   */
  graduate(coin: string): Promise<string>;
  /** `setPairTradingConfig(coin, slippageLimitBps, 0, takerFee)`, fee on the 1e8 scale. Creator, after graduation. */
  setTradingConfig(coin: string, slippageLimitBps: number, takerFeeNum: number): Promise<string>;
  /** `collectLockedFees(coin, recipient)`. Creator, after graduation. */
  collectFees(coin: string, recipient: string): Promise<string>;
  /** `releaseVested(coin, recipient)`. Creator, `vest12Months` only, whatever has vested since the last release. */
  releaseVested(coin: string, recipient: string): Promise<string>;
}

/**
 * The live execution, pinned to the coin's OWN chain: the portfolio is
 * cross-chain, so the wallet's ambient chain is routinely a different one.
 */
export function coinAdminFor(networkName: string): CoinAdminExecution {
  const send = async (
    functionName: "graduate" | "setPairTradingConfig" | "collectLockedFees" | "releaseVested",
    args: readonly unknown[],
  ): Promise<string> => {
    const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
    const generator = contractAddress(networkName, "assetGenerator");
    if (!chain || !generator) throw new CoinAdminError("unknown", "This coin's network isn't available here.");
    const account = getAccount(wagmiConfig);
    if (!account.address) throw new CoinAdminError("unknown", "Connect a wallet first.");
    if (account.chainId !== chain.id) await switchChain(wagmiConfig, { chainId: chain.id });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        chainId: chain.id,
        address: generator,
        abi: AssetGeneratorABI,
        functionName,
        args: args as never,
        account: account.address,
      });
      const hash = await writeContract(wagmiConfig, request);
      const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: chain.id, hash });
      if (receipt.status !== "success") throw new CoinAdminError("unknown", "The transaction reverted. Nothing was changed.");
      return hash;
    } catch (error) {
      throw describeCoinAdminError(error);
    }
  };
  return {
    graduate: (coin) => send("graduate", [coin]),
    setTradingConfig: (coin, bps, fee) => send("setPairTradingConfig", [coin, bps, 0, fee]),
    collectFees: (coin, recipient) => send("collectLockedFees", [coin, recipient]),
    releaseVested: (coin, recipient) => send("releaseVested", [coin, recipient]),
  };
}
