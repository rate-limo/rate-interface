import { describe, expect, it } from "vitest";
import { chartTicker } from "./ticker";

describe("chartTicker", () => {
  it("qualifies the symbol with the contract address", () => {
    expect(chartTicker({ symbol: "NOVA/USDC", id: "0xF2640EFf6987a3b55abd7909d20Df4D246DeF104" })).toBe(
      "NOVA/USDC@0xF2640EFf6987a3b55abd7909d20Df4D246DeF104",
    );
  });

  it("falls back to the bare symbol when the row has no address", () => {
    expect(chartTicker({ symbol: "NOVA" })).toBe("NOVA");
  });

  it("is empty for a row with no symbol, which keeps chart queries disabled", () => {
    expect(chartTicker({ symbol: "", id: "0xabc" })).toBe("");
  });
});
