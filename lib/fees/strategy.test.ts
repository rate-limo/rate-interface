import { describe, expect, it } from "vitest";
import {
  FEE_ALLOCATION,
  MAX_GRADUATED_FEE_NUM,
  feePolicy,
} from "./strategy";
import { classifyPairByAddress, type AssetClassification } from "./registry";

describe("market fee strategy", () => {
  it("uses familiar creation tiers for stable, major and exotic markets", () => {
    expect(feePolicy("stable").feePct).toBe("0.01");
    expect(feePolicy("correlated").feePct).toBe("0.05");
    expect(feePolicy("major").feePct).toBe("0.30");
    expect(feePolicy("volatile").feePct).toBe("1.00");
  });

  it("classifies by verified address records and fails closed for spoofed assets", () => {
    const entry = (address: string, symbol: string, kind: AssetClassification["kind"], referenceAsset: AssetClassification["referenceAsset"]): AssetClassification => ({ address, symbol, kind, referenceAsset, verified: true });
    const registry = new Map([
      ["0xusdc", entry("0xUSDC", "USDC", "fiat", "USD")],
      ["0xusdt", entry("0xUSDT", "USDT", "fiat", "USD")],
      ["0xeth", entry("0xETH", "ETH", "major", "ETH")],
      ["0xweth", entry("0xWETH", "WETH", "wrapped", "ETH")],
    ]);
    expect(classifyPairByAddress("0xUSDC", "0xUSDT", registry)).toBe("stable");
    expect(classifyPairByAddress("0xETH", "0xWETH", registry)).toBe("correlated");
    expect(classifyPairByAddress("0xETH", "0xUSDC", registry)).toBe("major");
    expect(classifyPairByAddress("0xfake-usdc", "0xUSDT", registry)).toBe("volatile");
  });

  it("allocates the entire fee and caps graduated markets at 30 bps", () => {
    expect(Object.values(FEE_ALLOCATION).reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(MAX_GRADUATED_FEE_NUM).toBe(300_000);
  });
});
