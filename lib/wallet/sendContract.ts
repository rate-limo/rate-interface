"use client";

/**
 * Send a contract call, choosing the path the connected wallet actually needs.
 *
 * ## Why this exists
 *
 * Every chain-pinned write in this app has the same hazard: the wallet may be
 * on a different chain than the page. Under AppKit that was routine — it asked
 * the wallet to switch to its configured default on EVERY connection handshake
 * — and a launch from /create?chain=arc-testnet would simulate against RISE,
 * where Arc's USDC quote does not exist, and die with no prompt and nothing on
 * screen. See lib/launch/execution.ts.
 *
 * For an EMBEDDED wallet that hazard is removable, not merely survivable.
 * Privy holds the key, so `sendTransaction` takes a `chainId` in the request
 * and signs for that chain — no `wallet_switchEthereumChain`, no prompt to move
 * networks, no window where the user is on the wrong one.
 *
 * For an EXTERNAL wallet it is not removable. MetaMask signs through EIP-1193
 * and must be on the chain itself; that is the wallet's rule, not Privy's, and
 * no SDK gets around it. So that path still switches first — it just does it
 * here, once, instead of at each call site.
 *
 * ## What it deliberately does not do
 *
 * Simulate. Callers that care (the launch flow does) should keep simulating
 * through `@wagmi/core` first: an `eth_call` catches an encoding or argument
 * mistake as a rejected promise instead of a broadcast that fails after paying
 * gas. Simulation is a public read and needs no wallet, so it belongs with the
 * caller's own logic rather than behind this.
 */

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { MERA_CONNECTOR_ID } from "./meraConnector";
import { getBalance, switchChain, writeContract } from "@wagmi/core";
import type { Abi } from "viem";
import { wagmiConfig } from "@/lib/providers";
import { wagmiChains } from "@/lib/customChains";

/**
 * Thrown when the account cannot pay for the transaction it is about to send.
 *
 * A distinct type, not a string: the UI has to tell "you need funds" apart from
 * every other failure, because it is the one the user can actually do something
 * about — and on a passkey account there is no wallet popup to surface it, so if
 * this is swallowed the button simply appears not to work.
 */
export class InsufficientGasError extends Error {
  readonly chainId: number;
  readonly address: `0x${string}`;
  constructor(chainId: number, address: `0x${string}`) {
    super("This account has no funds to pay for the transaction.");
    this.name = "InsufficientGasError";
    this.chainId = chainId;
    this.address = address;
  }
}

export type SendContractArgs = {
  /** The chain this call must run on — never assumed from the wallet. */
  chainId: (typeof wagmiChains)[number]["id"];
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

export function useSendContract(): {
  /** Broadcasts and resolves with the transaction hash. */
  send: (call: SendContractArgs) => Promise<`0x${string}`>;
  /** True when sending will NOT ask the user to change networks. */
  chainFree: boolean;
} {
  const { address, connector } = useAccount();
  const embedded = connector?.id === MERA_CONNECTOR_ID;

  const send = useCallback(
    async (call: SendContractArgs): Promise<`0x${string}`> => {
      // A passkey account must never raise a wallet UI to change chains. It
      // cannot: switchChain on that connector is a local assignment, because a
      // key we hold signs for whichever chain the transaction names. The call
      // stays for the injected path, where it IS a real request the user can
      // refuse — `chainFree` is how a caller tells the two apart.
      if (wagmiConfig.state.chainId !== call.chainId) {
        await switchChain(wagmiConfig, { chainId: call.chainId });
      }

      // Check funds BEFORE signing, and only on the path that has no wallet of
      // its own. An injected wallet shows the user its own insufficient-funds
      // message; a passkey account shows nothing at all, so an unfunded send
      // would fail somewhere in the RPC and reach the user as a dead button.
      // This turns it into a state the UI can act on.
      if (embedded && address) {
        const balance = await getBalance(wagmiConfig, { address, chainId: call.chainId });
        if (balance.value === BigInt(0)) throw new InsufficientGasError(call.chainId, address);
      }
      return writeContract(wagmiConfig, {
        chainId: call.chainId,
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args as never,
        value: call.value,
      });
    },
    [embedded, address],
  );

  return { send, chainFree: embedded };
}
