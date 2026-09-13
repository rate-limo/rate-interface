import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ArcTestnet, BaseSepolia } from "@circle-fin/bridge-kit";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_USDC,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  bridgeKitChainKey,
  cctpDomainFor,
} from "./transferRoutes";

/**
 * These constants are a SECOND copy of facts Circle's SDK already ships, and
 * this file is what makes the copy safe.
 *
 * The copy exists because `@iter/db` and `identity-service` need the domain and
 * the chain key without taking a bridging SDK as a runtime dependency — a schema
 * module should not pull in viem and a token registry. So the values live here
 * as plain data, and the SDK is a devDependency used only to check them.
 *
 * The idiom is the one `graduation.ts` already uses for `eligibleSql` and
 * `decide`: one rule, two implementations, pinned against each other by a test.
 * Without it a chain id or a CCTP domain could drift silently, and the symptom
 * of a wrong domain is money burned on one chain and minted on another.
 */

test("chain ids match the SDK", () => {
  assert.equal(ARC_TESTNET_CHAIN_ID, ArcTestnet.chainId);
  assert.equal(BASE_SEPOLIA_CHAIN_ID, BaseSepolia.chainId);
});

test("CCTP domains match the SDK", () => {
  // A wrong domain does not fail loudly — it burns here and mints somewhere
  // else. This is the assertion that matters most in the file.
  assert.equal(cctpDomainFor(ARC_TESTNET_CHAIN_ID), ArcTestnet.cctp.domain);
  assert.equal(cctpDomainFor(BASE_SEPOLIA_CHAIN_ID), BaseSepolia.cctp.domain);
});

test("bridge kit chain keys match the SDK's own strings", () => {
  assert.equal(bridgeKitChainKey(ARC_TESTNET_CHAIN_ID), ArcTestnet.chain);
  assert.equal(bridgeKitChainKey(BASE_SEPOLIA_CHAIN_ID), BaseSepolia.chain);
});

test("USDC addresses match the SDK, compared lowercased", () => {
  assert.equal(ARC_TESTNET_USDC, ArcTestnet.usdcAddress.toLowerCase());
  assert.equal(BASE_SEPOLIA_USDC, BaseSepolia.usdcAddress.toLowerCase());
});

test("Arc accepts forwarder settlement as a DESTINATION", () => {
  // The whole deposit design rests on this: Arc's gas token is USDC, so a wallet
  // receiving its first USDC cannot pay to receive it. If Circle ever withdraws
  // destination forwarding for Arc, deposits into an empty wallet stop being
  // possible and this test is where that surfaces.
  assert.equal(ArcTestnet.cctp.forwarderSupported.destination, true);
});

test("Arc's native view is 18 decimals while its USDC ERC-20 is 6", () => {
  // Same pool of funds, two interfaces. Recorded here because every balance bug
  // in this app has come from treating them as two assets.
  assert.equal(ArcTestnet.nativeCurrency.decimals, 18);
  assert.equal(ArcTestnet.nativeCurrency.symbol, "USDC");
});
