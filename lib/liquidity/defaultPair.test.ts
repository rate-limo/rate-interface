import { describe, expect, it } from "vitest";
import { defaultPair, isStableSymbol, nativeSymbolFor } from "./defaultPair";

const t = (...symbols: string[]) => symbols.map((symbol) => ({ symbol }));

/** The two chains actually served, as their gateways really list them. */
const ARC = t("SKHY", "USDC", "BUCKO", "DONUT", "HOOPS");
const RISE = t("YEAST", "ETH", "DOUGH", "SKHY", "PHNX");

describe("nativeSymbolFor", () => {
  it("reads Arc's gas asset as USDC, which is the whole reason this is not a list", () => {
    // `utils/order.ts`'s isNativeSymbol is ETH/NEON/INJ/IP/MON/STT and has never
    // contained USDC, so a hardcoded list does not recognise Arc at all.
    expect(nativeSymbolFor("Arc Testnet")).toBe("USDC");
  });

  it("reads RISE's as ETH", () => {
    expect(nativeSymbolFor("RISE Testnet")).toBe("ETH");
  });

  it("is undefined for a chain the build does not carry", () => {
    expect(nativeSymbolFor("Nowhere Testnet")).toBeUndefined();
    expect(nativeSymbolFor(undefined)).toBeUndefined();
  });
});

describe("defaultPair", () => {
  it("quotes the stablecoin and bases the native coin", () => {
    expect(defaultPair(t("ETH", "USDC", "WBTC"), "ETH")).toEqual({ base: "ETH", quote: "USDC" });
  });

  it("moves the native coin to QUOTE when it IS the stablecoin", () => {
    /*
     * Arc: `nativeCurrency.symbol` is literally "USDC". One token cannot be both
     * sides, and the side it belongs on is the one it is — money.
     */
    expect(defaultPair(ARC, "USDC")).toEqual({ base: "SKHY", quote: "USDC" });
  });

  it("never opens on a token the chain does not list", () => {
    // The bug this replaces: "ETH"/"USDC" hardcoded, and Arc has no ETH.
    const pair = defaultPair(ARC, "USDC")!;
    const listed = ARC.map((x) => x.symbol);
    expect(listed).toContain(pair.base);
    expect(listed).toContain(pair.quote);
    expect(pair.base).not.toBe("ETH");
  });

  it("quotes the native coin when the chain has no stablecoin at all", () => {
    expect(defaultPair(RISE, "ETH")).toEqual({ base: "YEAST", quote: "ETH" });
  });

  it("prefers USDC over USDT when a chain carries both", () => {
    expect(defaultPair(t("USDT", "ETH", "USDC"), "ETH")).toEqual({ base: "ETH", quote: "USDC" });
  });

  it("does not base one stablecoin against another when anything else exists", () => {
    // USDT/USDC is a pool almost nobody opening this flow meant to open.
    expect(defaultPair(t("USDC", "USDT", "DONUT"), "USDC")).toEqual({
      base: "DONUT",
      quote: "USDC",
    });
  });

  it("falls back to a stablecoin base only when there is nothing else", () => {
    expect(defaultPair(t("USDC", "USDT"), "USDC")).toEqual({ base: "USDT", quote: "USDC" });
  });

  it("ignores a native symbol the chain does not actually list", () => {
    expect(defaultPair(t("DONUT", "USDC"), "ETH")).toEqual({ base: "DONUT", quote: "USDC" });
  });

  it("matches the native symbol case-insensitively", () => {
    expect(defaultPair(t("weth", "USDC"), "WETH")).toEqual({ base: "weth", quote: "USDC" });
  });

  it("returns null rather than a pair when the chain lists fewer than two tokens", () => {
    expect(defaultPair(t("USDC"), "USDC")).toBeNull();
    expect(defaultPair([], "ETH")).toBeNull();
  });

  it("ignores duplicate symbols when counting what is selectable", () => {
    // The picker collapses symbol collisions, so two USDC rows are one choice.
    expect(defaultPair(t("USDC", "USDC"), "USDC")).toBeNull();
  });

  it("never returns the same token on both sides", () => {
    for (const [tokens, native] of [
      [ARC, "USDC"],
      [RISE, "ETH"],
      [t("USDC", "USDT"), "USDC"],
      [t("A", "B"), undefined],
    ] as const) {
      const pair = defaultPair(tokens, native);
      expect(pair).not.toBeNull();
      expect(pair!.base).not.toBe(pair!.quote);
    }
  });
});

describe("isStableSymbol", () => {
  it("knows the usual money symbols, case-insensitively", () => {
    expect(isStableSymbol("usdc")).toBe(true);
    expect(isStableSymbol("DAI")).toBe(true);
  });

  it("does not claim anything else is money", () => {
    expect(isStableSymbol("DONUT")).toBe(false);
    expect(isStableSymbol("ETH")).toBe(false);
  });
});
