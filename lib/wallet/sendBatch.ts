"use client";

import { findChain } from "@iter/deployments";
import type { Address, Hex } from "viem";
import { MERA_CONNECTOR_ID } from "./meraConnector";
import type { BatchCall } from "./batchTransfer";

/**
 * Sending a batch, and deciding whether this wallet can.
 *
 * ## Only the mera account, and that is a property of the wallet
 *
 * Batching an EOA means EIP-7702, which means signing an authorization. The
 * mera account holds its own key in-process, so the connector can sign one and
 * build the transaction (see `mera_sendBatch`). An injected wallet signs
 * through EIP-1193 and exposes no method to authorize a delegate — MetaMask
 * decides whether and how it does 7702, not this app.
 *
 * So `canBatch` is not a feature flag. It answers a question about the
 * connected wallet, the same shape `hasSigner` already answers for chain
 * switching, and a caller that ignores it gets an unsupported-method error
 * rather than a silently unbatched transaction.
 *
 * ## The delegate comes from the registry, per chain
 *
 * `batchExecutor` in `@iter/deployments`. A chain without one cannot batch —
 * `null`, never a fallback to another chain's address, which would authorize
 * the account to run code at an address that holds nothing on this chain.
 *
 * Deployed on RISE (`0xdd54EE…4C3d`). Arc is unfunded at the time of writing,
 * so it resolves to null there and callers fall back to a plain transfer.
 */

/** wagmi's connector, narrowed to what this needs. */
interface ConnectorLike {
  id: string;
  getProvider: () => Promise<unknown>;
}

interface ProviderLike {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
}

/** The delegate for a chain, or null when none is deployed there. */
export function batchExecutorFor(chainId: number | undefined): Address | null {
  if (!chainId) return null;
  const address = findChain(chainId)?.contracts?.batchExecutor?.address;
  return address ?? null;
}

/**
 * Can this wallet, on this chain, send a batch?
 *
 * Both halves matter and they fail for different reasons: a MetaMask user on
 * RISE cannot batch because of the wallet, and a mera user on Arc cannot
 * because of the chain. A caller showing "fee applies" should ask this first —
 * promising a split the send cannot perform is worse than not offering one.
 */
export function canBatch(
  connector: { id: string } | undefined,
  chainId: number | undefined,
): boolean {
  return connector?.id === MERA_CONNECTOR_ID && batchExecutorFor(chainId) !== null;
}

export class BatchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchUnavailableError";
  }
}

/**
 * Send several calls as ONE transaction.
 *
 * Goes through the connector's provider rather than wagmi's `sendTransaction`,
 * which has no `authorizationList` in its parameters and drops it — the result
 * being an ordinary transaction that runs the first call and nothing else, with
 * no error anywhere. That silence is the reason this is its own function.
 */
export async function sendBatch(args: {
  connector: ConnectorLike | undefined;
  chainId: number | undefined;
  calls: readonly BatchCall[];
}): Promise<Hex> {
  const executor = batchExecutorFor(args.chainId);
  if (!args.connector || args.connector.id !== MERA_CONNECTOR_ID) {
    throw new BatchUnavailableError("This wallet cannot send a batched transaction.");
  }
  if (!executor) {
    throw new BatchUnavailableError("No batch executor is deployed on this chain.");
  }
  if (args.calls.length === 0) {
    throw new BatchUnavailableError("A batch needs at least one call.");
  }

  const provider = (await args.connector.getProvider()) as ProviderLike;
  return (await provider.request({
    method: "mera_sendBatch",
    params: [
      {
        executor,
        // Hex, not bigint: this crosses an EIP-1193 boundary, and JSON has no
        // bigint. The connector converts back.
        calls: args.calls.map((c) => ({
          to: c.to,
          value: `0x${c.value.toString(16)}` as Hex,
          data: c.data,
        })),
      },
    ],
  })) as Hex;
}
