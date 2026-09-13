"use client";

import * as bridgeKit from "@circle-fin/bridge-kit";
import { BridgeKit, type BridgeChain } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";

/**
 * A CCTP bridge, signed by whichever wallet is handed in.
 *
 * ## One function, both directions
 *
 * A deposit hands in the INJECTED wallet's provider; a withdrawal hands in the
 * passkey's (`meraConnector.getProvider()`). Both are EIP-1193 and the SDK takes
 * a raw provider, so there is one implementation rather than a deposit bridge
 * and a withdraw bridge that drift.
 *
 * That also keeps this outside wagmi entirely, which matters twice: it preserves
 * `lib/wallet/externalFunding.ts`'s rule that nothing there can become
 * `useAccount()`, and it sidesteps Circle's own wagmi adapter targeting wagmi 3
 * while this app is on 2.14.
 *
 * ## `recipientAddress`, never a second adapter
 *
 * Circle's docs show `to: { adapter, chain }`, which bridges to the SENDER's own
 * address. That is not a deposit. Passing `recipientAddress` with `useForwarder`
 * means no destination adapter exists at all: the external wallet signs on the
 * source chain and the passkey account receives, without the external wallet
 * ever needing to sign — or hold gas — on the destination.
 *
 * ## Forwarder settlement is REQUIRED for a deposit, not preferred
 *
 * The SDK's `ForwarderDestination` — the only destination shape that takes no
 * adapter — declares `useForwarder: true` as a literal. So an adapter-less
 * destination and forwarder settlement are the same thing, and there is no
 * "deliver to this address, and let them submit the mint" option at all.
 *
 * That settles a question the route schema leaves open. `settlement: "self"` is
 * coherent for a WITHDRAWAL, where the passkey account signs on both sides and
 * could submit its own mint. For a deposit it is not: the money is going to an
 * account the sending wallet cannot sign for. `bridgeIn` refuses it rather than
 * quietly bridging to the sender's own address, which is what passing an adapter
 * here would do.
 *
 * On Arc the requirement bites hardest anyway: gas there IS USDC, so a wallet
 * receiving its first USDC has no gas to pay for receiving it.
 * `transferRoutes.pin.test.ts` asserts Arc still accepts forwarder settlement as
 * a destination, so that ceasing to be true fails a test rather than a deposit.
 */

export interface BridgeParams {
  sourceChainId: number;
  destinationChainId: number;
  /** Decimal string in the asset's own units, e.g. "250.00". */
  amount: string;
  /** Where the money lands. For a deposit this is the passkey account. */
  recipient: string;
  useForwarder: boolean;
}

export type BridgeOutcome =
  | { ok: true; mintTxHash: string | null }
  | { ok: false; reason: string };

/** The step names this module reports upward, in the order they occur. */
export type BridgeStep = "switch" | "approve" | "burn" | "attest" | "mint";

export const BRIDGE_STEP_LABEL: Record<BridgeStep, string> = {
  switch: "Switch network in your wallet",
  approve: "Approve the transfer",
  burn: "Confirm in your wallet",
  attest: "Waiting for confirmation",
  mint: "Delivering to your wallet",
};

/**
 * Turn a failure into a sentence.
 *
 * A rejection is reported as a DECISION, not a failure — the same rule
 * `useWalletConnect` already applies, and for the same reason: calling it a
 * failure hides the retry and makes a user think the app is broken.
 */
/**
 * Turn a chain or wallet error into a sentence someone can act on.
 *
 * The screen printed viem's whole message — fee caps in wei, request arguments,
 * the RPC's raw text and a library version — under a Deposit button. That is not
 * a hard error to understand, it is an error nobody reads: the one actionable
 * word ("retry") is buried in 300 characters of diagnostics.
 *
 * Same posture `utils/orderErrors.ts` already takes for reverts and
 * `lib/wallet/walletFailure.ts` for wallet faults: name the cause and the move.
 * The raw text is not discarded — it goes to the console, where a developer can
 * still find it and a user is not made to read it.
 */
export function humaniseChainError(raw: string): string | null {
  // Gas price moved between the estimate and the send. Common on busy testnets
  // and entirely transient, which is the whole point of saying so.
  if (/max fee per gas less than block base fee|fee cap .* lower than/i.test(raw)) {
    return "Network fees moved while this was submitting. Try again.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "Not enough gas on the source network to send this.";
  }
  if (/nonce too low|already known|replacement transaction underpriced/i.test(raw)) {
    return "Your wallet is still finishing an earlier transaction. Wait for it, then try again.";
  }
  if (/intrinsic gas too low|gas required exceeds/i.test(raw)) {
    return "Your wallet set the gas too low for this transfer. Try again, or raise the gas limit.";
  }
  if (/execution reverted/i.test(raw)) {
    return "The network refused the transfer. Nothing was sent.";
  }
  if (/timeout|timed out/i.test(raw)) {
    return "The network did not answer in time. Nothing was sent — try again.";
  }
  if (/429|rate ?limit|too many requests/i.test(raw)) {
    return "The network's public RPC is refusing requests right now. Wait a moment and try again.";
  }
  if (/user rejected|user denied|rejected the request/i.test(raw)) {
    return "You declined the transaction.";
  }
  return null;
}

/**
 * viem appends "Request Arguments:", "Details:" and "Version:" blocks to its
 * messages. Useful in a console, unreadable in a panel — the first line is the
 * part written for a person.
 */
export function firstLine(raw: string): string {
  return raw.split(/\n|Request Arguments:|Details:|Version:/)[0]!.trim();
}

export function describeBridgeFailure(error: unknown): string {
  const code = (error as { code?: number } | null)?.code;
  if (code === 4001) return "You declined the transaction.";

  const message = error instanceof Error ? error.message : String(error);
  const said = humaniseChainError(message);
  if (said) return said;
  if (/insufficient balance/i.test(message)) {
    return "Not enough of that asset in the connected wallet.";
  }
  // The raw text stays reachable without being shown.
  if (typeof console !== "undefined") console.warn("[bridge]", message);
  return `The transfer did not complete: ${firstLine(message)}`;
}

/**
 * Every chain the SDK can bridge, by EIP-155 id.
 *
 * Built from the SDK's exports rather than naming chains, and that is a fix
 * rather than a tidy-up: this held exactly Arc and Base Sepolia, so a route the
 * operator had registered for any other chain would reach `bridgeIn` and be
 * refused as "not configured for bridging" — a chain offered in the panel that
 * cannot actually be used. admin-service had the same two-entry bug in its own
 * copy and refused 23 of the 25 chains its picker offered.
 *
 * `bridgeKitChainKey` in @iter/types keeps the two-entry constant deliberately:
 * it is what `@iter/db` and identity-service use, and a schema package must not
 * take a bridging SDK as a runtime dependency. Here the SDK is present, so the
 * full list is free.
 */
interface SdkChainMeta {
  chainId: number;
  chain: BridgeChain;
  name?: string;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  rpcEndpoints?: string[];
  explorerUrl?: string;
}

const SDK_CHAINS: Record<number, SdkChainMeta> = Object.fromEntries(
  Object.values(bridgeKit as Record<string, unknown>)
    .filter((v): v is SdkChainMeta & { cctp: unknown } => {
      const c = v as Partial<{ chainId: number; chain: string; cctp: unknown }>;
      return (
        !!c &&
        typeof c === "object" &&
        typeof c.chainId === "number" &&
        typeof c.chain === "string" &&
        !!c.cctp
      );
    })
    .map((c) => [c.chainId, c]),
);

/**
 * Put the wallet on the SOURCE chain before asking it to burn.
 *
 * The omission that made every bridge fail with nothing to read. An injected
 * wallet signs only for the chain it is standing on, so a user on Arc clicking
 * "bridge from Arbitrum Sepolia" was asking their wallet to sign a transaction
 * for a network it was not on — and the SDK's failure surfaced here as the
 * generic "did not complete".
 *
 * `externalFunding.ensureChain` does this already and cannot be reused: its
 * add-chain path reads `wagmiChains`, so it throws "Iter does not serve chain
 * 421614" for every bridge source. Iter does not serve them, and that is the
 * whole point — the money is somewhere Iter does not trade. The metadata comes
 * from the SDK instead, which carries it for all 25.
 *
 * `eth_chainId` first, because `wallet_switchEthereumChain` is a PROMPT and
 * firing it blind interrupts someone already on the right network. 4902 means
 * the wallet does not know the chain, which for a testnet is the normal case
 * rather than an error.
 */
export async function ensureSourceChain(
  provider: EIP1193Provider,
  chainId: number,
): Promise<void> {
  const hex = `0x${chainId.toString(16)}`;

  try {
    const current = (await provider.request({ method: "eth_chainId" })) as string;
    if (typeof current === "string" && current.toLowerCase() === hex.toLowerCase()) return;
  } catch {
    // A wallet that will not say where it is still gets asked to switch.
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    } as never);
    return;
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    const message = String((error as Error)?.message ?? "");
    if (code !== 4902 && !/unrecognized chain|unsupported chain/i.test(message)) throw error;
  }

  const chain = SDK_CHAINS[chainId];
  if (!chain?.rpcEndpoints?.length || !chain.nativeCurrency) {
    throw new Error(`No network details to add chain ${chainId} to your wallet.`);
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: hex,
        chainName: chain.name ?? String(chain.chain).replace(/_/g, " "),
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcEndpoints,
        blockExplorerUrls: chain.explorerUrl
          ? [chain.explorerUrl.replace(/\/tx\/\{hash\}$/, "")]
          : undefined,
      },
    ],
  } as never);
}

export async function bridgeIn(
  params: BridgeParams,
  provider: EIP1193Provider,
  onStep?: (step: BridgeStep) => void,
): Promise<BridgeOutcome> {
  const from = SDK_CHAINS[params.sourceChainId];
  const to = SDK_CHAINS[params.destinationChainId];
  if (!from || !to) {
    return { ok: false, reason: "That network pair is not configured for bridging." };
  }

  // See the module docstring: an adapter-less destination IS forwarder
  // settlement, so a self-settled deposit has no shape in this SDK. Refused
  // rather than approximated — the nearest approximation bridges to the sender.
  if (!params.useForwarder) {
    return {
      ok: false,
      reason: "That route settles on the destination, which deposits do not support yet.",
    };
  }

  try {
    // Before anything else: an injected wallet signs only for the chain it is
    // on, and the burn happens on the SOURCE.
    onStep?.("switch");
    await ensureSourceChain(provider, params.sourceChainId);

    const adapter = await createViemAdapterFromProvider({ provider });
    const kit = new BridgeKit();

    // The action keys are bare — `approve`, `burn`, `fetchAttestation`, `mint`.
    // Circle's published examples show `bridge.approve` and similar; those are
    // not the names the SDK's own `CCTPV2Actions` declares, and subscribing to
    // them compiles to nothing and reports no progress. Verified against
    // @circle-fin/provider-cctp-v2's type definitions.
    //
    // Reporting each one matters for the same reason FUNDING_STEP_LABEL exists:
    // a bridge is several prompts, and a user who approved the first and still
    // sees a spinner concludes the app is broken.
    let mintTxHash: string | null = null;
    kit.on("approve", () => onStep?.("approve"));
    kit.on("burn", () => onStep?.("burn"));
    kit.on("fetchAttestation", () => onStep?.("attest"));
    kit.on("mint", (payload) => {
      mintTxHash = payload.values.txHash ?? null;
      onStep?.("mint");
    });

    const result = await kit.bridge({
      from: { adapter, chain: from.chain },
      // `useForwarder: true` as a literal, which is what selects the
      // adapter-less ForwarderDestination branch. Passing the boolean widens it
      // and TypeScript then demands a destination adapter.
      to: { recipientAddress: params.recipient, chain: to.chain, useForwarder: true },
      amount: params.amount,
    });

    if (result.state !== "success") {
      /*
       * SAY WHICH STEP. This returned a bare "The bridge did not complete.",
       * which tells a user nothing they can act on and told me nothing while
       * debugging it — the actual cause (the wallet being on the wrong chain)
       * was invisible from the screen.
       *
       * The SDK reports per-step state, so the failed step and its message are
       * what the sentence should carry.
       */
      const steps = (result as { steps?: { name?: string; state?: string; error?: unknown }[] })
        .steps;
      const failed = steps?.find((step) => step.state === "error");
      const detail =
        failed?.error instanceof Error
          ? failed.error.message
          : typeof failed?.error === "string"
            ? failed.error
            : undefined;
      if (failed?.name) {
        if (detail) {
          const said = humaniseChainError(detail);
          if (typeof console !== "undefined") console.warn("[bridge]", failed.name, detail);
          return {
            ok: false,
            // The step name goes FIRST when we have a sentence for the cause, so
            // "approve" and "burn" failing are distinguishable without the user
            // having to read a fee cap in wei to tell them apart.
            reason: said
              ? `${said} (stopped at ${failed.name})`
              : `The transfer stopped at ${failed.name}: ${firstLine(detail)}`,
          };
        }
        return { ok: false, reason: `The transfer stopped at ${failed.name}.` };
      }
      return { ok: false, reason: "The bridge did not complete." };
    }
    return { ok: true, mintTxHash };
  } catch (error) {
    return { ok: false, reason: describeBridgeFailure(error) };
  }
}
