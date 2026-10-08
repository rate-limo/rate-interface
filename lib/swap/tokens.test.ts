import { describe, expect, it } from "vitest";
import { getHubToken } from "./tokens";

describe("getHubToken", () => {
  it("falls back to the chain's listed stablecoin, never an addressless USDC (Tempo)", () => {
    const hub = getHubToken("Tempo Testnet");
    expect(hub.symbol).toBe("PathUSD");
    expect(hub.address.toLowerCase()).toBe("0x20c0000000000000000000000000000000000000");
    expect(hub.chainId).toBe(42431);
    expect(hub.decimals).toBe(6);
  });
});
