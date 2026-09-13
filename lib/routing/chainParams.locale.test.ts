import { describe, it, expect } from "vitest";
import {
  buildPageUrl,
  pageKindFromPathname,
  setSourceChainOnUrl,
  siblingChainUrls,
  stripLocale,
  tradeGearFromPathname,
  withLocale,
} from "./chainParams";

/**
 * Locale-prefix handling in the routing helpers.
 *
 * These exist because a locale segment breaks this family SILENTLY. Every
 * helper reads the first path segment, so `/ko/trade` reports its kind as "ko",
 * `pageKindFromPathname` returns null, and the callers — 97 of them — quietly
 * do nothing: no nav highlight, no chain switch. Nothing throws, so only a test
 * that asserts the prefixed form catches it.
 *
 * `en` is the default locale and carries no prefix, so the un-prefixed cases
 * below are also the regression guard for every URL that exists today.
 */

describe("stripLocale", () => {
  it("leaves an unprefixed path alone", () => {
    expect(stripLocale("/trade")).toEqual({ locale: null, rest: "/trade" });
    expect(stripLocale("/trade/pro")).toEqual({ locale: null, rest: "/trade/pro" });
  });

  it("does not mistake a page for a locale", () => {
    // "pair", "pass", "pool" are real first segments. A sloppy check that just
    // took a two-or-three-letter first segment would eat them.
    for (const p of ["/pair", "/pass", "/pool", "/iter", "/price/0xabc"]) {
      expect(stripLocale(p).locale).toBeNull();
      expect(stripLocale(p).rest).toBe(p);
    }
  });

  it("splits a supported locale off the front", () => {
    // `en` is the only locale today and is never emitted as a prefix, but it IS
    // recognised if one appears — a hand-typed /en/trade must still resolve.
    expect(stripLocale("/en/trade")).toEqual({ locale: "en", rest: "/trade" });
    expect(stripLocale("/en/trade/pro")).toEqual({ locale: "en", rest: "/trade/pro" });
  });

  it("handles the bare root", () => {
    expect(stripLocale("/").rest).toBe("/");
    expect(stripLocale("/en").rest).toBe("/");
  });
});

describe("pageKindFromPathname", () => {
  it("resolves the kind with no prefix, exactly as before i18n", () => {
    expect(pageKindFromPathname("/trade")).toBe("trade");
    expect(pageKindFromPathname("/trade/pro")).toBe("trade");
    expect(pageKindFromPathname("/launch")).toBe("launch");
    expect(pageKindFromPathname("/pair")).toBe("pair");
    expect(pageKindFromPathname("/portfolio")).toBe("portfolio");
  });

  it("resolves the kind THROUGH a locale prefix", () => {
    // The whole point. Before stripLocale this returned null and the sidebar
    // went dark on every localized page.
    expect(pageKindFromPathname("/en/trade")).toBe("trade");
    expect(pageKindFromPathname("/en/trade/pro")).toBe("trade");
    expect(pageKindFromPathname("/en/launch")).toBe("launch");
  });

  it("still returns null for a genuinely unknown page", () => {
    expect(pageKindFromPathname("/nonsense")).toBeNull();
    expect(pageKindFromPathname("/")).toBeNull();
  });
});

describe("tradeGearFromPathname", () => {
  it("tells Basic from Pro with and without a prefix", () => {
    expect(tradeGearFromPathname("/trade")).toBe("basic");
    expect(tradeGearFromPathname("/trade/pro")).toBe("pro");
    expect(tradeGearFromPathname("/en/trade")).toBe("basic");
    expect(tradeGearFromPathname("/en/trade/pro")).toBe("pro");
  });

  it("is null off the trade routes", () => {
    expect(tradeGearFromPathname("/pool")).toBeNull();
    expect(tradeGearFromPathname("/en/pool")).toBeNull();
  });
});

describe("setSourceChainOnUrl", () => {
  it("sets the chain and preserves the path", () => {
    expect(setSourceChainOnUrl("/trade", "?chain=old", "new")).toBe("/trade?chain=new");
  });

  it("keeps other params", () => {
    const out = setSourceChainOnUrl("/trade/pro", "?chain=old&base=ETH", "new");
    expect(out).toContain("base=ETH");
    expect(out).toContain("chain=new");
  });

  it("canonicalizes the default locale away rather than echoing /en back", () => {
    // `as-needed` means the default locale has no prefix, so /en/trade IS
    // /trade. Echoing the prefix back would mint a duplicate URL per page.
    expect(setSourceChainOnUrl("/en/trade", "?chain=old", "new")).toBe("/trade?chain=new");
  });

  it("is a no-op for a chain-less page", () => {
    expect(setSourceChainOnUrl("/portfolio", "", "new")).toBe("/portfolio");
  });
});

describe("siblingChainUrls", () => {
  it("produces one URL per other chain", () => {
    const urls = siblingChainUrls("/en/trade", "?chain=a", ["b", "c"]);
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u.startsWith("/trade?")).toBe(true);
  });
});

describe("withLocale — the branch that activates on the second locale", () => {
  it("prefixes a NON-default locale", () => {
    // Unreachable through the public helpers while `en` is the only locale, and
    // the one line that has to be right the day "ko" is added. Without it,
    // switching chains on /ko/trade would silently return the user to English.
    expect(withLocale("ko", "/trade")).toBe("/ko/trade");
    expect(withLocale("ko", "/trade/pro")).toBe("/ko/trade/pro");
    expect(withLocale("ko", "/")).toBe("/ko");
  });

  it("never prefixes the default locale or a missing one", () => {
    expect(withLocale("en", "/trade")).toBe("/trade");
    expect(withLocale(null, "/trade")).toBe("/trade");
  });
});

describe("buildPageUrl", () => {
  it("still emits unprefixed URLs — the default locale never gets one", () => {
    // Emitting /en/trade would create a second address for every page and split
    // caches and share links between them.
    expect(buildPageUrl("trade", { slug: "rise" })).toBe("/trade?chain=rise");
    expect(buildPageUrl("launch", { slug: "rise" })).toBe("/launch?chain=rise");
    // `launch` is discovery and `create` is the flow that used to own that
    // path. Both are chain-scoped, and pinning them together is what catches a
    // future edit collapsing one back into the other.
    expect(buildPageUrl("create", { slug: "rise" })).toBe("/create?chain=rise");
    expect(buildPageUrl("portfolio")).toBe("/portfolio");
  });
});
