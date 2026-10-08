import { describe, it, expect } from "vitest";
import { defaultConnectedChain } from "@/consts";
import {
  pageKindFromPathname,
  readDisplaySlug,
  supportedNetworkName,
  buildPageUrl,
  buildExploreSectionUrl,
  setSourceChainOnUrl,
  siblingChainUrls,
  tradeGearFromPathname,
  DEFAULT_CHAIN_SLUG,
} from "./chainParams";

describe("pageKindFromPathname", () => {
  it("maps first path segment to a page kind", () => {
    expect(pageKindFromPathname("/swap")).toBe("swap");
    expect(pageKindFromPathname("/trade")).toBe("trade");
    expect(pageKindFromPathname("/token/WETH")).toBe("token");
    expect(pageKindFromPathname("/explore")).toBe("explore");
    expect(pageKindFromPathname("/iter")).toBe("iter");
  });
  it("returns null for unknown or root paths", () => {
    expect(pageKindFromPathname("/")).toBeNull();
    expect(pageKindFromPathname("/account")).toBeNull();
  });
});

describe("profile is chain-scoped, and keeps its address", () => {
  it("reads ?chain= rather than pinning the default", () => {
    // The defect: page.tsx hardcoded DEFAULT_CHAIN_SLUG while FollowListModal
    // and CoinList emitted ?chain= on the links they generated — so following a
    // chain-scoped link FROM the profile landed on the default chain and showed
    // "no trades" and "$0 volume" for a wallet busy on the other one.
    expect(readDisplaySlug("profile", { chain: "rise-testnet" })).toBe("rise-testnet");
  });

  it("falls back to the default for a missing or unknown chain", () => {
    expect(readDisplaySlug("profile", {})).toBe(DEFAULT_CHAIN_SLUG);
  });

  it("switching chains keeps the wallet in the path", () => {
    // A profile URL is address-bound. A switcher that rebuilt the URL from the
    // page kind alone would drop the wallet and land on someone else's page —
    // or nobody's.
    const urls = siblingChainUrls("/profile/0xabc", "?chain=arc-testnet", ["rise-testnet"]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/profile/0xabc");
    expect(urls[0]).toContain("chain=rise-testnet");
  });

  it("preserves ?tab= across a chain switch", () => {
    // The tab is the reader's place on the page; changing chain should not
    // bounce them back to the default tab.
    const [url] = siblingChainUrls("/profile/0xabc", "?chain=arc-testnet&tab=coins", ["rise-testnet"]);
    expect(url).toContain("tab=coins");
  });
});

describe("readDisplaySlug", () => {
  it("reads chain for single-chain pages, default otherwise", () => {
    // Swap merged into Trade (2026-07-29), so it reads `chain` like trade does
    // rather than the old from-to `fromchain`.
    expect(readDisplaySlug("swap", { chain: "base-sepolia" })).toBe("base-sepolia");
    expect(readDisplaySlug("trade", { chain: "rise-testnet" })).toBe("rise-testnet");
    expect(readDisplaySlug("portfolio", {})).toBe(DEFAULT_CHAIN_SLUG);
  });
  it("falls back to the default slug when the param is missing", () => {
    expect(readDisplaySlug("swap", {})).toBe(DEFAULT_CHAIN_SLUG);
    expect(readDisplaySlug("pool", {})).toBe(DEFAULT_CHAIN_SLUG);
  });
  it("handles array-valued params by taking the first", () => {
    expect(readDisplaySlug("trade", { chain: ["a", "b"] })).toBe("a");
  });
});

describe("supportedNetworkName", () => {
  // This is the guard readDisplaySlug deliberately does NOT apply — see its own
  // doc. /trade?chain=monad-testnet used to 500: slugToNetworkName resolved it
  // to "Monad Testnet" fine, a name PonderLinks has no entry for, and the page
  // built `${undefined}/api/tokens/1000/1` and threw ERR_INVALID_URL.
  it("resolves a currently supported slug to its network name", () => {
    expect(supportedNetworkName("rise-testnet")).toBe("RISE Testnet");
  });
  it("falls back for a slug naming a chain removed from supportedChains", () => {
    // somnia-testnet and megaeth-testnet are still registered in slugToNetworkName
    // (see its own comment) — this is the case those entries exist to prove:
    // recognized, but not fetchable.
    expect(supportedNetworkName("somnia-testnet")).toBe(defaultConnectedChain);
  });
  it("falls back for a slug that maps to nothing at all", () => {
    expect(supportedNetworkName("not-a-real-chain")).toBe(defaultConnectedChain);
  });
});

describe("buildPageUrl", () => {
  it("builds per-page URLs", () => {
    // Explore is cross-chain: its lists fan out to every served chain, so its
        // URL names none. See SCHEME.explore.
        expect(buildPageUrl("explore", { slug: "s" })).toBe("/explore");
    expect(buildPageUrl("portfolio", { slug: "s" })).toBe("/portfolio");
    expect(buildPageUrl("pool", { slug: "s" })).toBe("/pool?chain=s");
    expect(buildPageUrl("iter", { slug: "s" })).toBe("/iter?chain=s");
    expect(buildPageUrl("token", { slug: "s", token: "WETH" })).toBe("/token/WETH?chain=s");
    // The bare index is gone; a token-less link means the directory.
    // The directory is Explore's tokens section, which is cross-chain.
    expect(buildPageUrl("token", { slug: "s" })).toBe("/explore/tokens");
  });
  // Swap merged into Trade: Basic (/trade) is the convert card and takes tokens,
  // Pro (/trade/pro) is the order book and is the only pair-bound gear.
  it("sends the legacy swap kind to Trade's Basic gear", () => {
    expect(buildPageUrl("swap", { slug: "s" })).toBe("/trade?chain=s");
    // The old ?fromchain=/?tochain= pair is gone with the merge.
    expect(buildPageUrl("swap", { slug: "a" })).toBe("/trade?chain=a");
  });

  it("drops base/quote on Basic, which is not pair-bound", () => {
    expect(buildPageUrl("trade", { slug: "s" })).toBe("/trade?chain=s");
    expect(buildPageUrl("trade", { slug: "s", base: "WETH" })).toBe("/trade?chain=s");
    expect(buildPageUrl("trade", { slug: "s", base: "WETH", quote: "USDC" })).toBe(
      "/trade?chain=s",
    );
  });

  it("carries base/quote to Pro", () => {
    expect(buildPageUrl("trade", { slug: "s", pro: true })).toBe("/trade/pro?chain=s");
    expect(buildPageUrl("trade", { slug: "s", pro: true, base: "WETH" })).toBe(
      "/trade/pro?chain=s&base=WETH",
    );
    expect(
      buildPageUrl("trade", { slug: "s", pro: true, base: "WETH", quote: "USDC" }),
    ).toBe("/trade/pro?chain=s&base=WETH&quote=USDC");
  });

  // Pool splits the same way Trade does: bare route reads, deeper route acts.
  it("narrows an explore section to one chain with the param Explore reads", () => {
    // `chains`, plural, holding a network NAME — `?chain=<slug>` is the dead
    // param this surface ignores, and the two differ by one letter.
    expect(buildExploreSectionUrl("tokens")).toBe("/explore/tokens");
    expect(buildExploreSectionUrl("tokens", { chains: "Arc Testnet" })).toBe(
      "/explore/tokens?chains=Arc%20Testnet",
    );
  });

  it("sends pool to the overview unless the provide flow is asked for", () => {
    expect(buildPageUrl("pool", { slug: "s" })).toBe("/pool?chain=s");
    // the overview is market-wide, so a pair must not leak into it
    expect(buildPageUrl("pool", { slug: "s", base: "ETH", quote: "USDC" })).toBe(
      "/pool?chain=s",
    );
  });

  it("carries the pair into the provide flow", () => {
    expect(buildPageUrl("pool", { slug: "s", provide: true })).toBe("/pool/new?chain=s");
    expect(
      buildPageUrl("pool", { slug: "s", provide: true, base: "ETH", quote: "USDC" }),
    ).toBe("/pool/new?chain=s&base=ETH&quote=USDC");
    expect(
      buildPageUrl("pool", { slug: "s", deposit: true, base: "ETH", quote: "USDC" }),
    ).toBe("/pool/deposit?chain=s&base=ETH&quote=USDC");
  });
});

describe("tradeGearFromPathname", () => {
  it("distinguishes the two gears", () => {
    expect(tradeGearFromPathname("/trade")).toBe("basic");
    expect(tradeGearFromPathname("/trade/pro")).toBe("pro");
  });
  it("returns null off the Trade surface", () => {
    expect(tradeGearFromPathname("/pool")).toBeNull();
    expect(tradeGearFromPathname("/")).toBeNull();
  });
  it("still reports Trade as the page kind in both gears, so nav stays lit", () => {
    expect(pageKindFromPathname("/trade")).toBe("trade");
    expect(pageKindFromPathname("/trade/pro")).toBe("trade");
  });
});

describe("setSourceChainOnUrl", () => {
  it("sets chain on the Trade gears, preserving the pair on Pro", () => {
    expect(setSourceChainOnUrl("/trade", "?chain=a", "x")).toBe("/trade?chain=x");
    expect(setSourceChainOnUrl("/trade/pro", "?chain=a&base=WETH&quote=USDC", "x")).toBe(
      "/trade/pro?chain=x&base=WETH&quote=USDC",
    );
  });
  it("sets chain on single-chain pages, preserving other params", () => {
    expect(setSourceChainOnUrl("/trade", "?chain=a&base=WETH", "x")).toBe(
      "/trade?chain=x&base=WETH",
    );
  });
  it("is a no-op for portfolio (no chain param)", () => {
    expect(setSourceChainOnUrl("/portfolio", "", "x")).toBe("/portfolio");
  });
  it("returns path+search unchanged for unknown pages", () => {
    expect(setSourceChainOnUrl("/account", "?q=1", "x")).toBe("/account?q=1");
  });
});

describe("siblingChainUrls", () => {
  it("returns the same page with each other chain", () => {
    expect(siblingChainUrls("/trade", "?chain=a", ["b", "c"])).toEqual([
      "/trade?chain=b",
      "/trade?chain=c",
    ]);
  });
  it("returns empty for portfolio", () => {
    expect(siblingChainUrls("/portfolio", "", ["a", "b"])).toEqual([]);
  });
});

describe("short chain names", () => {
  it("resolves ?chain=rise to the RISE slug instead of falling back to the default", () => {
    expect(readDisplaySlug("launch", { chain: "rise" })).toBe("rise-testnet");
    expect(readDisplaySlug("launch", { chain: "ARC" })).toBe("arc-testnet");
  });
});
