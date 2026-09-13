/**
 * Which assets can move cross-chain, and by whose rails.
 *
 * ## A row is a PROVED route, never an intention
 *
 * `./transfer.ts` already argues the general case this feature inherits: a
 * webhook carries the app's claim, and the app is a browser, so anything it
 * asserts about someone else's money is a client asserting it. The same standard
 * governs the registry. A route exists because Circle's own API confirmed it, or
 * because a real bridge completed and its destination mint was read back off the
 * chain — never because a migration said so. The table ships empty.
 *
 * `provenance` carries that distinction into the type system and `isOfferable`
 * is the one place it is enforced.
 *
 * ## Why the provider's chain key is stored rather than derived
 *
 * Neither rail speaks EIP-155. Circle's Bridge Kit takes `"Arc_Testnet"`;
 * LayerZero takes `"arc-testnet"`. Deriving one from a chain id means a lookup
 * that silently returns undefined for a chain nobody added, which is how a route
 * becomes inert with no error anywhere. The row carries the key it will actually
 * be called with.
 */

// The same concept `./transfer.ts` already names for verifying a reported
// transfer, and deliberately not a second declaration of it: two identical
// unions under one name is how the two drift.
import type { TransferDirection } from "./transfer";

export type { TransferDirection };

/**
 * The rails.
 *
 * `layerzero` is accepted by the schema and implemented by nothing. Measured
 * 2026-09-11: LayerZero's Value Transfer API lists 107 chains and **zero
 * testnets** — no Arc, no Sepolia — and no testnet host resolves. So a LayerZero
 * route cannot be proved on a testnet, and an unprovable route is one this
 * design refuses to record. The column accommodates the rail for the day a
 * mainnet chain is served.
 */
export type TransferProvider = "cctp" | "layerzero";

/**
 * How this row came to exist. NOT a confidence score — a statement of evidence.
 *
 * - `transfer`  — a real bridge completed and its destination mint was verified
 *                 on chain. The strongest claim available.
 * - `discovery` — the provider's own API confirmed it serves this route.
 * - `demo`      — recorded for a screenshot. NEVER offered to a user.
 */
export type RouteProvenance = "transfer" | "discovery" | "demo";

/** Who submits the destination side. `forwarder` needs no gas from the recipient. */
export type RouteSettlement = "forwarder" | "self";

export interface TransferRoute {
  chainId: number;
  /**
   * The canonical asset this row is a leg of — `"USDC"`.
   *
   * This is the ONE place a symbol is load-bearing, and it needs justifying
   * given the address-keying rule everywhere else. A bridge is a pair of chains,
   * and the same asset has a DIFFERENT address on each: USDC is `0x3600…` on Arc
   * and `0x036c…` on Base Sepolia. So "which other chains can send me this?"
   * cannot be answered by address at all.
   *
   * It is safe here and not elsewhere because this string is set by an operator
   * on a row that was proved, never read from token metadata a user controls. A
   * counterfeit USDC cannot acquire a row by being called USDC; it would have to
   * pass `proveCctpRoute`, which asks Circle.
   */
  asset: string;
  /** Lowercased. The asset's identity ON THIS CHAIN; never its ticker. */
  tokenAddress: string;
  provider: TransferProvider;
  providerChainKey: string;
  /** Into an Iter wallet. */
  depositEnabled: boolean;
  /** Out to an external address. */
  withdrawEnabled: boolean;
  minAmount: number;
  /** Null is uncapped. */
  maxAmount: number | null;
  settlement: RouteSettlement;
  provenance: RouteProvenance;
}

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/**
 * Arc's USDC ERC-20 view: 6 decimals.
 *
 * The native view is 18 decimals and is the SAME pool of funds. Never sum them,
 * never format one with the other's decimals (a 10^12 error), and never call
 * `decimals()` on a native sentinel address.
 */
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
export const BASE_SEPOLIA_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

/**
 * CCTP domain ids. Circle's own numbering, unrelated to EIP-155.
 *
 * Deliberately short: a domain is added when a route through it has been proved,
 * not in anticipation. An absent chain returns null and every caller treats that
 * as "not bridgeable here", which is the safe direction.
 */
export const CCTP_DOMAINS: Readonly<Record<number, number>> = Object.freeze({
  [ARC_TESTNET_CHAIN_ID]: 26,
  [BASE_SEPOLIA_CHAIN_ID]: 6,
});

export function cctpDomainFor(chainId: number): number | null {
  const domain = CCTP_DOMAINS[chainId];
  return domain === undefined ? null : domain;
}

const BRIDGE_KIT_CHAIN_KEYS: Readonly<Record<number, string>> = Object.freeze({
  [ARC_TESTNET_CHAIN_ID]: "Arc_Testnet",
  [BASE_SEPOLIA_CHAIN_ID]: "Base_Sepolia",
});

export function bridgeKitChainKey(chainId: number): string | null {
  return BRIDGE_KIT_CHAIN_KEYS[chainId] ?? null;
}

/**
 * The single gate.
 *
 * A `demo` row is inert HERE rather than filtered by each caller — a filter
 * every reader must remember is a filter one of them forgets, and the one that
 * forgets is the one that moves money.
 */
export function isOfferable(route: TransferRoute, direction: TransferDirection): boolean {
  if (route.provenance === "demo") return false;
  return direction === "deposit" ? route.depositEnabled : route.withdrawEnabled;
}
