import { wagmiChains } from "@/lib/customChains";
import { tip20GasToken } from "@/lib/chains/gasToken";

/**
 * "You cannot pay the network fee" — recognised, and said in a way someone can act on.
 *
 * ## Why this needed its own module
 *
 * Every other failure a write can produce is a REVERT: the contract refused, and
 * `utils/orderErrors.ts` decodes which rule was broken. This one is not a revert at all.
 * The node rejects the raw transaction before any code runs, with JSON-RPC -32003, and
 * nothing in the decode path can see it — so it fell through to viem's own prose, which
 * on the order path meant an 18-line, 735-character toast ending in `Version: viem@2.55.0`.
 *
 * It is also the only failure here the user can fix in thirty seconds, which is what
 * earns it a button rather than a sentence.
 *
 * ## It is worse on a passkey account than an injected one
 *
 * MetaMask refuses an unfundable transaction in its own window, with its own message. The
 * mera account is a viem `LocalAccount` held in memory (lib/wallet/meraConnector.ts), so
 * signing is a silent computation: there is no wallet window, and the app's toast is the
 * ONLY thing the user ever sees. Measured on a fresh zero-balance account, every earlier
 * gate passes — `eth_call` does not price gas so simulation succeeds, and neither Arc nor
 * RISE checks the balance during `eth_estimateGas` — so the first and only notice is the
 * rejection at broadcast.
 */

/**
 * How the user gets gas, which is NOT one answer.
 *
 * A faucet is a TESTNET answer and only a testnet answer — on a production chain nothing
 * hands anybody the gas asset, so a "Get test USDC" button there would be a link to a page
 * that cannot help. The universal answer is that the funds have to ARRIVE: from an
 * exchange, from another wallet, from wherever the user already holds the asset. So the
 * fallback is the account's own address, which is the one thing they need to make that
 * happen and the one thing a brand-new passkey account never shows them.
 *
 * Deliberately NOT offered: swapping into the gas asset, or bridging from another chain
 * with this app. Both are transactions, and a transaction is the thing this wallet cannot
 * currently pay for — the button would fail with the error it was offered to fix. That
 * holds on Arc too, where gas IS USDC: holding some other Arc token does not help, because
 * spending it costs gas.
 */
export type GasTopUp =
  /** Self-serve, and free. Testnets only. */
  | { kind: "faucet"; label: string; href: string }
  /** Open the deposit sheet — QR to scan, address to copy. Works anywhere. */
  | { kind: "receive"; label: string };

export interface InsufficientGasCopy {
  title: string;
  description: string;
  action: GasTopUp;
}

/**
 * Where a TESTNET's gas comes from. Absence is the normal case, not a gap.
 *
 * Only the URL lives here. The asset's SYMBOL is read from the chain registry below,
 * because it is already there and a second copy is how Arc ends up telling people to
 * deposit ETH — its gas asset is USDC, and the 18-decimal native view is the same pool of
 * funds as the 6-decimal ERC-20 at 0x3600…0000, not a separate token.
 *
 * A chain absent from this map falls through to `receive`, which is right for every
 * mainnet by definition and right for a testnet whose faucet we do not know: an action
 * that opens the wrong faucet is worse than one that just hands over the address.
 */
const FAUCETS: Record<number, string> = {
  // Arc pays gas in USDC, so Circle's own testnet faucet IS the gas faucet.
  5042002: "https://faucet.circle.com",
  11155931: "https://faucet.testnet.riselabs.xyz",
  10143: "https://faucet.monad.xyz",
  // Tempo has no gas coin: its faucet hands out the TIP-20 stablecoins fees are paid in.
  42431: "https://tempo.xyz/developers/docs/quickstart/faucet/",
};

/** The node's phrasing, from `eth_sendRawTransaction`. Deliberately the full clause rather
 * than a bare "insufficient funds": contracts revert with that wording about TOKEN balances
 * too, and sending someone to a gas faucet over an ERC-20 shortfall wastes their time. */
const NODE_PHRASE = /insufficient funds for gas/i;

/** Tempo's phrasing, from `eth_estimateGas` when the account's fee token cannot pay:
 * "gas required exceeds allowance (0)" (measured on Moderato 2026-10-08). Only the
 * ZERO allowance: a non-zero one is a gas-cap complaint, not an empty balance. */
const ZERO_ALLOWANCE_PHRASE = /gas required exceeds allowance \(0\)/i;

/** JSON-RPC: transaction rejected. What both chains answer here, measured. */
const RPC_INSUFFICIENT_FUNDS = -32003;

export function isInsufficientFunds(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 10; depth++) {
    const node = current as { name?: unknown; code?: unknown; details?: unknown; message?: unknown };
    if (node.name === "InsufficientFundsError") return true;
    if (node.code === RPC_INSUFFICIENT_FUNDS) return true;
    for (const text of [node.details, node.message]) {
      if (typeof text === "string" && (NODE_PHRASE.test(text) || ZERO_ALLOWANCE_PHRASE.test(text))) return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** What paying for gas on a given chain costs you, in the sense of WHICH asset. */
export interface GasAsset {
  chainId: number;
  symbol: string;
  chainName: string;
  testnet: boolean;
}

/** The chain's own gas asset, or null for a chain this build does not carry. */
export function gasAssetFor(chainId: number | undefined): GasAsset | null {
  if (chainId === undefined) return null;
  const chain = wagmiChains.find((c) => c.id === chainId);
  if (!chain) return null;
  return {
    chainId: chain.id,
    // Tempo has no gas coin: name the TIP-20 its fees are paid in.
    symbol: tip20GasToken(chain.id)?.symbol ?? chain.nativeCurrency.symbol,
    chainName: chain.name,
    testnet: chain.testnet === true,
  };
}

/**
 * What to put on screen, given the asset — split from the chain lookup above so the
 * production branch is reachable.
 *
 * Not a seam invented for a test: "which chain is this" and "what do we say about it" are
 * genuinely different questions, and only the second is worth pinning. It matters because
 * `wagmiChains` currently carries testnets only, so a test that goes through
 * `insufficientGasCopy(1)` exercises the NO-CHAIN branch while appearing to check the
 * mainnet one — which is how the faucet-on-mainnet bug would ship again unnoticed.
 */
export function describeGasShortfall(asset: GasAsset | null): InsufficientGasCopy {
  if (!asset) {
    // No chain, so no asset name and no faucet lookup. The address is still the right
    // thing to hand over — a generic instruction beats a confidently wrong asset name.
    return {
      title: "Not enough funds for the network fee",
      description:
        "This wallet has nothing to pay the network fee with. Send some to it and try again.",
      action: { kind: "receive", label: "Deposit" },
    };
  }

  // Gated on `testnet` and not merely on the map having an entry: a faucet is a testnet
  // concept, so a production chain must not reach one even if an id is added by mistake.
  const faucet = asset.testnet ? FAUCETS[asset.chainId] : undefined;
  const title = `Add ${asset.symbol} to cover the network fee`;

  if (faucet) {
    return {
      title,
      description:
        `${asset.chainName} charges its fee in ${asset.symbol}, and this wallet has none. ` +
        `The faucet is free and takes about a minute.`,
      action: { kind: "faucet", label: `Get test ${asset.symbol}`, href: faucet },
    };
  }

  return {
    title,
    // No "costs a fraction of a cent" here. That is true of a testnet and an assumption
    // anywhere else, and a fee this module cannot see is not one to make promises about.
    description:
      `${asset.chainName} charges its fee in ${asset.symbol}, and this wallet has none. ` +
      `Send ${asset.symbol} to this address on ${asset.chainName}, then try again.`,
    action: { kind: "receive", label: "Deposit" },
  };
}

/**
 * The chain's faucet, when it has one, for a surface that is NOT reporting a failure.
 *
 * The deposit sheet offers this permanently on a testnet: on a chain where the gas asset
 * is free, "here is your address" is a worse answer than "here is the tap", and the sheet
 * is reached from the account menu long before anything has gone wrong.
 *
 * Gated on `testnet` for the same reason `describeGasShortfall` gates on it rather than on
 * the map having an entry — a faucet is a testnet concept, and a production chain must not
 * reach one even if an id is added to the map by mistake.
 *
 * Returns the label as well as the href so the asset is named once, here, from the chain
 * registry. A caller writing its own "Get test ETH" is how Arc — which pays fees in USDC —
 * ends up telling people to fetch the wrong token.
 */
export function gasFaucetFor(chainId: number | undefined): { label: string; href: string } | null {
  const asset = gasAssetFor(chainId);
  if (!asset || !asset.testnet) return null;
  const href = FAUCETS[asset.chainId];
  return href ? { label: `Get test ${asset.symbol}`, href } : null;
}

/**
 * What to put on screen for a chain id.
 *
 * Names the asset, because on a venue serving several chains "gas" is not one thing — it
 * is ETH on RISE and USDC on Arc, and a user who reads "add ETH" while holding Arc USDC
 * has been told to do something impossible.
 *
 * There is ALWAYS an action. The fallback is the account's own address, which is what a
 * user needs on a production chain, where nothing is free and the asset has to be sent in
 * from wherever they already hold it.
 */
export function insufficientGasCopy(chainId?: number): InsufficientGasCopy {
  return describeGasShortfall(gasAssetFor(chainId));
}
