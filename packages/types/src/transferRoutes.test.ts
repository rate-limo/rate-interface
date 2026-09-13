import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_USDC,
  bridgeKitChainKey,
  cctpDomainFor,
  isOfferable,
  type TransferRoute,
} from "./transferRoutes";

function route(over: Partial<TransferRoute> = {}): TransferRoute {
  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    asset: "USDC",
    tokenAddress: ARC_TESTNET_USDC,
    provider: "cctp",
    providerChainKey: "Arc_Testnet",
    depositEnabled: true,
    withdrawEnabled: true,
    minAmount: 1,
    maxAmount: null,
    settlement: "forwarder",
    provenance: "transfer",
    ...over,
  };
}

test("cctpDomainFor knows Arc and Base Sepolia, and nothing it was not told", () => {
  assert.equal(cctpDomainFor(5042002), 26);
  assert.equal(cctpDomainFor(84532), 6);
  // RISE has no CCTP domain. Null, not undefined and not a guess.
  assert.equal(cctpDomainFor(11155931), null);
});

test("bridgeKitChainKey returns the SDK's own string, not a chain id", () => {
  assert.equal(bridgeKitChainKey(5042002), "Arc_Testnet");
  assert.equal(bridgeKitChainKey(84532), "Base_Sepolia");
  assert.equal(bridgeKitChainKey(999999), null);
});

test("a demo route is never offerable in either direction", () => {
  const demo = route({ provenance: "demo" });
  assert.equal(isOfferable(demo, "deposit"), false);
  assert.equal(isOfferable(demo, "withdraw"), false);
});

test("a demo route stays inert even with both directions enabled", () => {
  // The point of the gate: provenance outranks the flags, so a row that looks
  // fully configured cannot move money if nobody proved it.
  const demo = route({ provenance: "demo", depositEnabled: true, withdrawEnabled: true });
  assert.equal(isOfferable(demo, "deposit"), false);
});

test("direction flags are honoured independently", () => {
  assert.equal(isOfferable(route({ withdrawEnabled: false }), "deposit"), true);
  assert.equal(isOfferable(route({ withdrawEnabled: false }), "withdraw"), false);
  assert.equal(isOfferable(route({ depositEnabled: false }), "deposit"), false);
});

test("a discovery-proved route is offerable — the provider confirmed it exists", () => {
  assert.equal(isOfferable(route({ provenance: "discovery" }), "deposit"), true);
});
