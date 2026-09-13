import { describe, expect, it } from "vitest";
import type { TransferRoute } from "@iter/types";
import { destinationLeg, sourcesFor, withinLimits } from "./registry";

const arc: TransferRoute = {
  chainId: 5042002,
  asset: "USDC",
  tokenAddress: "0x3600000000000000000000000000000000000000",
  provider: "cctp",
  providerChainKey: "Arc_Testnet",
  depositEnabled: true,
  withdrawEnabled: true,
  minAmount: 1,
  maxAmount: 100,
  settlement: "forwarder",
  provenance: "transfer",
};

const baseSepolia: TransferRoute = {
  ...arc,
  chainId: 84532,
  tokenAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  providerChainKey: "Base_Sepolia",
};

describe("withinLimits", () => {
  it("refuses below the minimum, naming the minimum", () => {
    expect(withinLimits(arc, 0.5)).toEqual({ ok: false, reason: "Minimum is 1" });
  });

  it("refuses above the maximum", () => {
    expect(withinLimits(arc, 250)).toEqual({ ok: false, reason: "Maximum is 100" });
  });

  it("accepts the boundaries themselves", () => {
    expect(withinLimits(arc, 1).ok).toBe(true);
    expect(withinLimits(arc, 100).ok).toBe(true);
  });

  it("treats a null maximum as uncapped", () => {
    expect(withinLimits({ ...arc, maxAmount: null }, 1e9).ok).toBe(true);
  });

  it("refuses a non-finite amount rather than passing NaN to a bridge", () => {
    expect(withinLimits(arc, Number.NaN)).toEqual({ ok: false, reason: "Enter an amount" });
  });

  it("refuses zero as 'enter an amount', not as below the minimum", () => {
    // An empty field parses to 0 or NaN; reporting "Minimum is 1" there names a
    // rule the user has not broken yet.
    expect(withinLimits(arc, 0)).toEqual({ ok: false, reason: "Enter an amount" });
  });
});

describe("sourcesFor", () => {
  it("finds the other legs of the same asset on the same rail", () => {
    expect(sourcesFor([arc, baseSepolia], "USDC", 5042002).map((r) => r.chainId)).toEqual([84532]);
  });

  it("never returns the destination itself as a source", () => {
    const sources = sourcesFor([arc, baseSepolia], "USDC", 5042002);
    expect(sources.some((r) => r.chainId === 5042002)).toBe(false);
  });

  it("matches across chains by asset, since the address differs on each", () => {
    // The two legs have different tokenAddresses. An address-keyed match would
    // find nothing here, which is the whole reason `asset` exists.
    expect(arc.tokenAddress).not.toEqual(baseSepolia.tokenAddress);
    expect(sourcesFor([arc, baseSepolia], "USDC", 5042002)).toHaveLength(1);
  });

  it("returns nothing when the destination has no leg", () => {
    // A provider that cannot mint here is not a route into here, however many
    // chains can burn.
    expect(sourcesFor([baseSepolia], "USDC", 5042002)).toEqual([]);
  });

  it("does not cross rails", () => {
    const viaLayerZero: TransferRoute = { ...baseSepolia, provider: "layerzero" };
    expect(sourcesFor([arc, viaLayerZero], "USDC", 5042002)).toEqual([]);
  });

  it("does not mix assets", () => {
    const otherAsset: TransferRoute = { ...baseSepolia, asset: "EURC" };
    expect(sourcesFor([arc, otherAsset], "USDC", 5042002)).toEqual([]);
  });

  it("is empty for an empty registry — the shipped state", () => {
    expect(sourcesFor([], "USDC", 5042002)).toEqual([]);
  });
});

describe("destinationLeg", () => {
  it("returns the leg for the landing chain", () => {
    expect(destinationLeg([arc, baseSepolia], "USDC", 5042002)?.chainId).toBe(5042002);
  });

  it("is null when nothing lands there", () => {
    expect(destinationLeg([baseSepolia], "USDC", 5042002)).toBeNull();
  });
});
