import { describe, expect, it, vi } from "vitest";

/**
 * The formatting half of `useNetworkFee`, which is where the honesty rules live.
 *
 * The hook itself needs wagmi; what is worth pinning is what it does with a gas price
 * once it has one — in particular that an unmeasurable fee never renders as a number,
 * and that one fixed precision does not have to serve both chains. Arc lands near
 * 0.0017 USDC and RISE near 0.0000000000002 ETH, four orders of magnitude apart.
 */

const gasPrice = vi.hoisted(() => ({ data: undefined as bigint | undefined, isLoading: false, isError: false }));
vi.mock("wagmi", () => ({ useGasPrice: () => gasPrice, useAccount: () => ({ address: undefined }) }));
vi.mock("@/lib/wallet/feeToken", async () => {
  const { tip20GasToken } = await import("@/lib/chains/gasToken");
  return { useFeeToken: (chainId: number | undefined) => tip20GasToken(chainId) };
});

const { useNetworkFee, GAS_LIMITS } = await import("./useNetworkFee");

const ARC = 5042002;
const RISE = 11155931;

function read(chainId: number | undefined, limit: bigint) {
  gasPrice.isLoading = false;
  gasPrice.isError = false;
  return useNetworkFee(chainId, limit);
}

describe("useNetworkFee", () => {
  it("names the chain's own gas asset, which is not the same asset per chain", () => {
    // Arc charges its fee in USDC; RISE in ETH. A dollar figure would need a price for
    // each and a second source that can disagree with the first.
    gasPrice.data = BigInt(25_000_000_000); // 25 gwei, measured on Arc
    expect(read(ARC, GAS_LIMITS.approve)).toMatchObject({ state: "ok", symbol: "USDC" });
    gasPrice.data = BigInt(9); // measured on RISE
    expect(read(RISE, GAS_LIMITS.approve)).toMatchObject({ state: "ok", symbol: "ETH" });
  });

  it("computes gasPrice × limit in the chain's decimals", () => {
    gasPrice.data = BigInt(25_000_000_000);
    const fee = read(ARC, BigInt(60_000));
    // 25 gwei × 60,000 = 1.5e15 wei = 0.0015 at 18 decimals.
    expect(fee).toMatchObject({ state: "ok", amount: "0.0015" });
  });

  it("switches to exponent form rather than rendering RISE's fee as zeros", () => {
    gasPrice.data = BigInt(9);
    const fee = read(RISE, BigInt(60_000));
    expect(fee.state).toBe("ok");
    if (fee.state === "ok") expect(fee.amount).toMatch(/e-/);
  });

  it("is unavailable, never zero, when the price cannot be read", () => {
    // The rule the status bar's gas chip already follows: a zero fee is
    // indistinguishable from a measured one, and at these sizes it would be believed.
    gasPrice.data = undefined;
    gasPrice.isError = true;
    expect(useNetworkFee(ARC, GAS_LIMITS.order).state).toBe("unavailable");

    gasPrice.isError = false;
    gasPrice.data = BigInt(0);
    expect(read(ARC, GAS_LIMITS.order).state).toBe("unavailable");
  });

  it("is unavailable for a chain this build does not carry", () => {
    gasPrice.data = BigInt(25_000_000_000);
    expect(read(1, GAS_LIMITS.order).state).toBe("unavailable");
  });

  it("reports loading rather than a figure before the price arrives", () => {
    gasPrice.data = undefined;
    gasPrice.isLoading = true;
    expect(useNetworkFee(ARC, GAS_LIMITS.order).state).toBe("loading");
  });

  it("prices Tempo's fee in PathUSD at 1e-18 dollars, not the placeholder native's 6 decimals", () => {
    // Tempo has no gas coin; gas * price is in 1e-18 dollars (90M gas at 1.2 gwei was
    // quoted as 0.108 TIP-20). Formatting with viem's placeholder 6 decimals would
    // print 384,000,000 for an order that costs 0.000384.
    gasPrice.data = BigInt(1_200_000_000);
    const fee = read(42431, BigInt(320_000));
    expect(fee).toEqual({ state: "ok", amount: "0.000384", symbol: "PathUSD" });
  });
});
