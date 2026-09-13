import { describe, expect, it } from "vitest";
import { currentMarketSymbolFromPath, resolveSwitchTarget } from "./switchLanding";

/**
 * Chain-switch landing: preserve the current market on the target chain if
 * it's listed there, else land on that chain's default markets route.
 * Never produce a path that could 404 / show an empty book.
 */
describe("resolveSwitchTarget", () => {
  it("routes to the same market symbol on the target chain's trade page when listed", () => {
    const target = resolveSwitchTarget({
      fromMarketSymbol: "WETH",
      toNetworkName: "Monad Testnet",
      toSlug: "monad-testnet",
      isListed: true,
    });
    // Pro gear: carrying a market means the order book, not the convert card.
    expect(target).toBe("/trade/pro?chain=monad-testnet&base=WETH");
  });

  it("falls back to the target chain's default/markets route when the market isn't listed there", () => {
    const target = resolveSwitchTarget({
      fromMarketSymbol: "WETH",
      toNetworkName: "Monad Testnet",
      toSlug: "monad-testnet",
      isListed: false,
    });
    expect(target).toBe("/explore");
  });

  it("falls back to the target chain's home when there is no current market (e.g. switching from a non-trade page)", () => {
    const target = resolveSwitchTarget({
      fromMarketSymbol: null,
      toNetworkName: "RISE Testnet",
      toSlug: "rise-testnet",
      isListed: false,
    });
    expect(target).toBe("/explore");
  });

  it("falls back to the target chain's home when fromMarketSymbol is undefined, even if isListed is (incorrectly) true", () => {
    // Defensive: a caller should never pass isListed:true without a symbol,
    // but the resolver must not produce a broken /trade/undefined path.
    const target = resolveSwitchTarget({
      fromMarketSymbol: undefined,
      toNetworkName: "RISE Testnet",
      toSlug: "rise-testnet",
      isListed: true,
    });
    expect(target).toBe("/explore");
  });

  it("falls back to the target chain's home when fromMarketSymbol is an empty string", () => {
    const target = resolveSwitchTarget({
      fromMarketSymbol: "",
      toNetworkName: "RISE Testnet",
      toSlug: "rise-testnet",
      isListed: true,
    });
    expect(target).toBe("/explore");
  });

  it("is pure: the same input always produces the same output, with no I/O", () => {
    const input = {
      fromMarketSymbol: "PEPE",
      toNetworkName: "Monad Testnet",
      toSlug: "monad-testnet",
      isListed: true,
    };
    expect(resolveSwitchTarget(input)).toBe(resolveSwitchTarget({ ...input }));
  });
});

describe("currentMarketSymbolFromPath", () => {
  it("reads the base symbol from Pro, which is the pair-bound gear", () => {
    expect(currentMarketSymbolFromPath("/trade/pro", "?chain=rise-testnet&base=DOUGH&quote=ETH")).toBe(
      "DOUGH",
    );
  });

  it("returns null on /trade — Basic is NEVER pair-bound", () => {
    // The bug this replaces was exactly inverted: it read `/trade` and ignored
    // `/trade/pro`, so `resolveSwitchTarget` could never receive a symbol from
    // the only page that has one, and every chain switch from the terminal fell
    // through to the cross-chain fallback.
    expect(currentMarketSymbolFromPath("/trade", "?chain=rise-testnet&base=DOUGH")).toBeNull();
  });

  it("strips a REGISTERED locale prefix", () => {
    // Reading the first path segment directly is the trap chainParams.ts warns
    // about: the switch would silently stop carrying markets the moment a
    // second language ships.
    //
    // `en` because `routing.locales` is `["en"]` today, so it is the only
    // prefix `stripLocale` recognises. That is also why this test cannot yet
    // prove the case it exists for — an unregistered prefix like `/ko/...` is
    // correctly NOT stripped, since an unknown locale 404s rather than serving
    // a duplicate. Add a locale, and this covers it for real.
    expect(currentMarketSymbolFromPath("/en/trade/pro", "?base=SKHY&quote=ETH")).toBe("SKHY");
  });

  it("leaves an UNREGISTERED prefix alone", () => {
    // Not a locale, so not a Pro route. Stripping it would make the switcher
    // act on a path the router itself 404s.
    expect(currentMarketSymbolFromPath("/ko/trade/pro", "?base=SKHY")).toBeNull();
  });

  it("returns null when Pro names no base", () => {
    expect(currentMarketSymbolFromPath("/trade/pro", "?chain=arc-testnet")).toBeNull();
  });

  it("returns null for pages with no current market", () => {
    for (const path of ["/portfolio", "/explore", "/pool", "/price/SKHY", "/trade/pro/extra"]) {
      expect(currentMarketSymbolFromPath(path, "?base=DOUGH")).toBeNull();
    }
  });

  it("feeds resolveSwitchTarget end to end", () => {
    // The two were only ever wrong TOGETHER, so pinning them apart is not
    // enough: this asserts the composition the hook actually performs.
    const symbol = currentMarketSymbolFromPath("/trade/pro", "?chain=rise-testnet&base=DOUGH&quote=ETH");
    expect(
      resolveSwitchTarget({
        fromMarketSymbol: symbol,
        toNetworkName: "Arc Testnet",
        toSlug: "arc-testnet",
        isListed: true,
      }),
    ).toContain("DOUGH");
  });
});
