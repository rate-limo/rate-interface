import { describe, expect, it } from "vitest";
import { signedMoney } from "./PositionMiniCard";

/**
 * `signedMoney` is the only PnL formatter on this app — the position card, Top
 * trades and the PnL leaderboard all render through it — and every figure under
 * fifty cents used to round to `$0`. These pin the sub-dollar band, which is
 * where this venue's numbers actually live.
 */
describe("signedMoney", () => {
  it("compacts at a thousand and above", () => {
    // This pinned `+$1,234` — the whole-dollar `money` output — which is the half of the
    // venue's notation that was missing. Above a thousand a figure is compacted, the same
    // way `formatMarketCap` renders every token row.
    expect(signedMoney(1234)).toBe("+$1.2K");
    expect(signedMoney(-1234)).toBe("−$1.2K");
    expect(signedMoney(4_100_000)).toBe("+$4.1M");
    expect(signedMoney(-2_500_000_000)).toBe("−$2.5B");
  });

  it("renders the plain dollars band with its cents", () => {
    expect(signedMoney(1)).toBe("+$1");
    expect(signedMoney(12.34)).toBe("+$12.34");
    expect(signedMoney(-999.5)).toBe("−$999.5");
  });

  it("renders an exact zero as a neutral $0, with no sign", () => {
    expect(signedMoney(0)).toBe("$0");
  });

  it("uses subscript-zero notation below a cent", () => {
    // The regression: all four of these were `$0`.
    expect(signedMoney(0.0045)).toBe("+$0.0₂45");
    expect(signedMoney(-0.0045)).toBe("−$0.0₂45");
    expect(signedMoney(0.00000123)).toBe("+$0.0₅123");
    expect(signedMoney(-0.000004)).toBe("−$0.0₅4");
  });

  it("renders the 0.01–0.99 band plainly, where notation would not help", () => {
    expect(signedMoney(0.04)).toBe("+$0.04");
    expect(signedMoney(-0.04)).toBe("−$0.04");
    expect(signedMoney(0.5)).toBe("+$0.5");
  });

  it("shows no more precision than the number carries", () => {
    expect(signedMoney(0.04)).not.toContain("0.0400");
  });

  it("never returns a bare $0 for a non-zero position", () => {
    for (const n of [1e-9, -1e-9, 0.004, -0.4, 0.49]) {
      expect(signedMoney(n)).not.toBe("$0");
    }
  });
});
