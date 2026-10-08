import { describe, expect, it } from "vitest";
import { isTokenAddress, marketParam } from "./proMarket";

const NOVA_A = "0x35C60968CA948f71D57Bd2A0597B691E4cC8e8d3";
const NOVA_B = "0x0970e682bbD4F19f0feAEF250002D6462AC348DE";

describe("marketParam", () => {
  it("names a token by address, so two launches sharing a ticker get different links", () => {
    expect(marketParam({ id: NOVA_A, symbol: "NOVA" })).toBe(NOVA_A);
    expect(marketParam({ id: NOVA_B, symbol: "NOVA" })).toBe(NOVA_B);
  });

  it("takes a token-list row's `address` when there is no `id`", () => {
    expect(marketParam({ address: NOVA_A, symbol: "NOVA" })).toBe(NOVA_A);
  });

  it("falls back to the symbol only when no address is known", () => {
    expect(marketParam({ symbol: "ETH" })).toBe("ETH");
    expect(marketParam({ id: "not-an-address", symbol: "ETH" })).toBe("ETH");
  });
});

describe("isTokenAddress", () => {
  it("accepts 20-byte hex in any case and rejects symbols", () => {
    expect(isTokenAddress(NOVA_A)).toBe(true);
    expect(isTokenAddress(NOVA_A.toLowerCase())).toBe(true);
    expect(isTokenAddress("TITER")).toBe(false);
    expect(isTokenAddress("0x1234")).toBe(false);
    expect(isTokenAddress(undefined)).toBe(false);
  });
});
