import { describe, expect, it } from "vitest";
import { scopeFromUrl, scopeUrl } from "./scopeUrl";

const KNOWN = ["Arc Testnet", "RISE Testnet"];
const at = (path: string) => `https://rate.limo${path}`;

describe("scopeFromUrl", () => {
  it("reads a chain the venue actually serves", () => {
    expect(scopeFromUrl(at("/explore/tokens?chains=Arc%20Testnet"), KNOWN)).toBe("Arc Testnet");
  });

  it("ignores a chain nobody serves rather than asking the aggregator for it", () => {
    // `resolveAggregatorChains` treats any non-empty list as authoritative, so
    // an unknown name would fan out to a chain that does not exist and render
    // an empty Explore with nothing saying why.
    expect(scopeFromUrl(at("/explore/tokens?chains=Nonsense"), KNOWN)).toBeNull();
  });

  it("takes only the first of several — the scope control holds one chain", () => {
    expect(scopeFromUrl(at("/explore?chains=RISE%20Testnet,Arc%20Testnet"), KNOWN)).toBe("RISE Testnet");
  });

  it("answers null when the param is absent or empty", () => {
    expect(scopeFromUrl(at("/explore"), KNOWN)).toBeNull();
    expect(scopeFromUrl(at("/explore?chains="), KNOWN)).toBeNull();
  });

  it("is not confused by the dead singular `chain` param", () => {
    // `?chain=` is what this crumb used to carry, and Explore has always
    // ignored it — `SCHEME.explore` is "none".
    expect(scopeFromUrl(at("/explore/tokens?chain=arc-testnet"), KNOWN)).toBeNull();
  });
});

describe("scopeUrl", () => {
  it("writes the chain the scope narrowed to", () => {
    expect(scopeUrl(at("/explore/tokens"), "Arc Testnet")).toBe(at("/explore/tokens?chains=Arc+Testnet"));
  });

  it("drops the param when the scope widens back to every chain", () => {
    // Left behind, `?chains=` would claim a filter the page is no longer under
    // — the same lie `flowUrl` exists to prevent on /pool/new.
    expect(scopeUrl(at("/explore/tokens?chains=Arc+Testnet"), null)).toBe(at("/explore/tokens"));
  });

  it("leaves everything it does not own alone", () => {
    expect(scopeUrl(at("/ko/explore/tokens?ref=CODE"), "RISE Testnet")).toBe(
      at("/ko/explore/tokens?ref=CODE&chains=RISE+Testnet"),
    );
  });

  it("answers null when the URL already says this", () => {
    expect(scopeUrl(at("/explore?chains=Arc+Testnet"), "Arc Testnet")).toBeNull();
    expect(scopeUrl(at("/explore"), null)).toBeNull();
  });
});
