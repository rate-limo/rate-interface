import { describe, expect, it } from "vitest";
import type { SwapToken } from "@/lib/swap/types";
import { withFeeTokens } from "./feeTokenRows";

const pathUsd: SwapToken = {
  symbol: "PathUSD",
  name: "PathUSD",
  address: "0x20C0000000000000000000000000000000000000",
  decimals: 6,
  chainId: 42431,
  priceUsd: 1,
  logoURI: "path.png",
};

describe("withFeeTokens", () => {
  it("adds Tempo's unindexed fee stablecoins at $1, once each", () => {
    const rows = withFeeTokens(42431, [pathUsd]);
    expect(rows.map((t) => t.symbol)).toEqual(["PathUSD", "AlphaUSD", "BetaUSD", "ThetaUSD"]);
    expect(rows.slice(1).every((t) => t.priceUsd === 1 && t.decimals === 6 && t.chainId === 42431 && t.logoURI === "path.png")).toBe(true);
  });
  it("never duplicates one the gateway already lists (case-insensitive)", () => {
    const alpha = { ...pathUsd, symbol: "AlphaUSD", address: "0x20c0000000000000000000000000000000000001" };
    expect(withFeeTokens(42431, [pathUsd, alpha]).filter((t) => t.symbol === "AlphaUSD")).toHaveLength(1);
  });
  it("changes nothing on a chain with a native gas coin", () => {
    expect(withFeeTokens(11155931, [pathUsd])).toEqual([pathUsd]);
  });
});
