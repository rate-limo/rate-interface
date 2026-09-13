import { describe, expect, it } from "vitest";
import { sectionFromParam } from "./section";

describe("sectionFromParam", () => {
  it("accepts every real tab, so a link can target any of them", () => {
    for (const key of [
      "positions", "orders", "stopOrders", "lps", "trades",
      "history", "rewards", "referrals", "creator",
    ]) {
      expect(sectionFromParam(key)).toBe(key);
    }
  });

  it("separates the two order tabs — a stop order is not in Open orders", () => {
    expect(sectionFromParam("orders")).toBe("orders");
    expect(sectionFromParam("stopOrders")).toBe("stopOrders");
  });

  it("falls back for anything unknown rather than selecting a tab that isn't there", () => {
    // A hand-edited URL must open the default, never a blank panel.
    expect(sectionFromParam("nope")).toBeUndefined();
    expect(sectionFromParam("")).toBeUndefined();
    expect(sectionFromParam(undefined)).toBeUndefined();
    // Next gives an array when a param repeats; that is not a tab.
    expect(sectionFromParam(["orders", "trades"])).toBeUndefined();
    expect(sectionFromParam(42)).toBeUndefined();
  });
});
