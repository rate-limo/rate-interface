/**
 * Finishing a launch whose ladder was never placed.
 *
 * On a chain with `ladderDeferred` on — Tempo, whose 30M per-transaction gas cap
 * will not fit a whole launch — `launch()` lists the pair, runs the dev buy and
 * closes the bands, and the five-step ladder is a SECOND transaction. Between
 * the two the coin exists and has nothing for sale.
 *
 * `submit` deliberately does not retry that second transaction: retrying the
 * flow would launch a second coin. So the failure has to be recoverable from the
 * outside, and it is — `placeLadder` is permissionless and the ladder is fixed
 * by the launch, so the caller chooses nothing and a stranger can finish it.
 * Without this module the creator was told to "share this address with support".
 *
 * ## Detecting it
 *
 * There is no flag on `launches(coin)` and there will not be one: AssetGenerator
 * is one byte under EIP-170, so even a view getter does not fit. `ladderOf` is
 * the canonical read, and the test is exact rather than heuristic — ORDER IDS
 * START AT 1, so a placed ladder can never have `askIds[0] == 0`. The contract's
 * own guard uses the same test (`requireFilled` reverts `LadderNotPlaced` on it).
 *
 * On every chain where the ladder is placed inside `launch()`, this is false by
 * construction, so calling it there is a wasted read rather than a wrong answer.
 */

import { readContract, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { AssetGeneratorABI } from "@iter/abis";
import { findChain } from "@iter/deployments";
import { wagmiConfig } from "@/lib/providers";
import { wagmiChains } from "@/lib/customChains";

/**
 * A launch that reached the chain but whose ladder did not.
 *
 * Thrown instead of a bare `Error` so the confirm screen can offer to finish it
 * rather than printing a sentence about contacting support: the coin address is
 * the one thing the recovery needs, and a message is not a place to keep it.
 */
export class LadderNotPlacedError<T = unknown> extends Error {
  readonly coin: `0x${string}`;
  readonly pair: `0x${string}`;
  readonly networkName: string | number;
  /**
   * The receipt of the launch that DID succeed.
   *
   * Carried so the recovery screen can show the ordinary success state once the
   * ladder lands, rather than a thinner one assembled from the draft: the dev
   * buy's real numbers are in the launch receipt and are not recoverable later
   * without re-reading logs.
   */
  readonly launch: T;

  constructor(coin: `0x${string}`, pair: `0x${string}`, networkName: string | number, launch: T) {
    super(
      `Your coin ${coin} launched, but its price ladder was not placed, so nothing is for sale yet.`,
    );
    this.name = "LadderNotPlacedError";
    this.coin = coin;
    this.pair = pair;
    this.networkName = networkName;
    this.launch = launch;
  }
}

function resolve(networkName: string | number) {
  const chain = findChain(networkName);
  const generator = chain?.contracts.assetGenerator?.address;
  if (!chain || !generator) return null;
  const match = wagmiChains.find((c) => c.id === chain.chainId);
  if (!match) return null;
  return { chainId: match.id, generator };
}

/**
 * Has this coin launched with no ladder on the book?
 *
 * False on any failure — an unreachable RPC, a chain the wallet does not carry,
 * a coin that was never launched. The caller uses this to OFFER a recovery, and
 * offering one that cannot work is worse than staying quiet.
 */
/**
 * The rule, with no I/O: launched, and the first ask id still zero.
 *
 * Order ids start at 1, so `askIds[0] === 0` can only mean the ladder was never
 * placed — the same test `AssetGenerator.requireFilled` reverts `LadderNotPlaced`
 * on. A zero creator means this generator never launched the coin at all, which
 * is NOT a pending ladder and must not offer one.
 */
export function ladderIsUnplaced(args: {
  creator: string | undefined;
  askIds: readonly (bigint | number)[] | undefined;
}): boolean {
  const { creator, askIds } = args;
  if (!creator || /^0x0+$/i.test(creator)) return false;
  const first = askIds?.[0];
  if (first === undefined) return false;
  return BigInt(first) === BigInt(0);
}

export async function isLadderPending(
  coin: `0x${string}`,
  networkName: string | number,
): Promise<boolean> {
  const target = resolve(networkName);
  if (!target) return false;
  try {
    const launch = (await readContract(wagmiConfig, {
      chainId: target.chainId,
      address: target.generator,
      abi: AssetGeneratorABI,
      functionName: "launches",
      args: [coin],
    })) as unknown;
    // `launches` returns a struct; the creator is its first member and is zero
    // for a coin this generator never launched.
    const creator = Array.isArray(launch) ? (launch[0] as string | undefined) : undefined;
    if (!creator || /^0x0+$/i.test(creator)) return false;

    const ladder = (await readContract(wagmiConfig, {
      chainId: target.chainId,
      address: target.generator,
      abi: AssetGeneratorABI,
      functionName: "ladderOf",
      args: [coin],
    })) as { askIds?: readonly (bigint | number)[] } | undefined;
    return ladderIsUnplaced({ creator, askIds: ladder?.askIds });
  } catch {
    return false;
  }
}

/**
 * Place the ladder of a launch that deferred it.
 *
 * Permissionless, and it reverts `LadderAlreadyPlaced` on a second call — so the
 * button is safe to show to anyone, including two people at once: the loser of
 * that race gets a named revert rather than a second ladder.
 *
 * @returns the transaction hash once its receipt is in hand.
 */
export async function placeLadder(
  coin: `0x${string}`,
  networkName: string | number,
  account: `0x${string}`,
): Promise<`0x${string}`> {
  const target = resolve(networkName);
  if (!target) throw new Error("This chain is not configured in the wallet.");

  const hash = await writeContract(wagmiConfig, {
    chainId: target.chainId,
    address: target.generator,
    abi: AssetGeneratorABI,
    functionName: "placeLadder",
    args: [coin],
    account,
  });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: target.chainId, hash });
  if (receipt.status !== "success") {
    throw new Error("The ladder transaction reverted. The ladder is still unplaced.");
  }
  return hash;
}
