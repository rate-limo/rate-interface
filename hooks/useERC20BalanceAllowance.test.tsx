// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { SpotToken } from "@/types/tables";

/**
 * TradePageProvider hands this hook its base and quote, which are undefined
 * until the market resolves. The hook used to return early in that case, above
 * its own hooks, so the render that delivered the token called four more hooks
 * than the one before it and React threw. What is pinned here is that crossing.
 */

// One `data` reference across renders, as wagmi gives: a fresh array each
// render would re-run the hook's sync effect forever.
const read = vi.hoisted(() => ({
  enabled: [] as unknown[],
  refetch: () => Promise.resolve(),
  data: [{ result: BigInt(2_500_000) }, { result: BigInt(1_000_000) }],
}));
vi.mock("wagmi", () => ({
  useReadContracts: (args: { query?: { enabled?: boolean } }) => {
    read.enabled.push(args.query?.enabled);
    return {
      data: read.data,
      status: "success",
      error: null,
      queryKey: ["readContracts"],
      refetch: read.refetch,
    };
  },
}));

const { useERC20BalanceAllowance } = await import("./useERC20BalanceAllowance");

const USDC = { id: "0x0000000000000000000000000000000000000001", decimals: 6 } as unknown as SpotToken;
const OWNER = "0x00000000000000000000000000000000000000aa" as const;
const SPENDER = "0x00000000000000000000000000000000000000bb" as const;

describe("useERC20BalanceAllowance", () => {
  it("survives the token arriving after the first render", () => {
    read.enabled.length = 0;
    const { result, rerender } = renderHook(
      ({ token }: { token: SpotToken | undefined }) =>
        useERC20BalanceAllowance(token as SpotToken, OWNER, SPENDER),
      { initialProps: { token: undefined as SpotToken | undefined } },
    );

    expect(result.current.status).toBe("none");
    expect(result.current.data).toEqual({ balance: 0, allowance: 0 });

    rerender({ token: USDC });

    expect(result.current.status).toBe("success");
    expect(result.current.data).toEqual({ balance: 2.5, allowance: 1 });
    // No read is issued for a token that is not there yet.
    expect(read.enabled[0]).toBe(false);
    expect(read.enabled.at(-1)).toBe(true);
  });
});
