"use client";

import { findChain } from "@iter/deployments";
import type { Address, Hex } from "viem";
import { MERA_CONNECTOR_ID } from "./meraConnector";
import type { BatchCall } from "./batchTransfer";
import type { WalletRpc } from "./frame/protocol";

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
 * The batch as an EIP-1193 request, for the wallet's confirm control.
 *
 * A batch is always value-moving — an EIP-7702 authorization is a standing
 * power over the account — so the wallet frame refuses it on the silent path
 * (`lib/wallet/frame/policy.ts`) and it is signed only from the visible
 * confirm frame. This builds the request that control is handed.
 *
 * Hex, not bigint: this crosses a `postMessage` boundary, and the frame
 * converts back.
 */
export function batchRpc(args: { chainId: number | undefined; calls: readonly BatchCall[] }): WalletRpc {
  const executor = batchExecutorFor(args.chainId);
  if (!executor) {
    throw new BatchUnavailableError("No batch executor is deployed on this chain.");
  }
  if (args.calls.length === 0) {
    throw new BatchUnavailableError("A batch needs at least one call.");
  }
  return {
    method: "mera_sendBatch",
    params: [
      {
        executor,
        calls: args.calls.map((c) => ({
          to: c.to,
          value: `0x${c.value.toString(16)}` as Hex,
          data: c.data,
        })),
      },
    ],
  };
}

/**
 * Send several calls as ONE transaction, through the connector's provider.
 *
 * Kept for the shape's sake, but on the passkey connector this now FAILS with
 * the frame's `CONFIRM_REQUIRED`: a batch cannot be signed without a click on
 * the wallet origin. Callers use `batchRpc` and `WalletConfirmFrame` instead.
 * Left in place rather than deleted so that a caller written against the old
 * shape fails loudly at the call, not silently at the signature.
 */
export async function sendBatch(args: {
  connector: ConnectorLike | undefined;
  chainId: number | undefined;
  calls: readonly BatchCall[];
}): Promise<Hex> {
  if (!args.connector || args.connector.id !== MERA_CONNECTOR_ID) {
    throw new BatchUnavailableError("This wallet cannot send a batched transaction.");
  }
  const rpc = batchRpc(args);
  const provider = (await args.connector.getProvider()) as ProviderLike;
  return (await provider.request(rpc)) as Hex;
}
