/**
 * Which mark a chain badge renders.
 *
 * `chainIconFrom` is the whole rule, and it is worth pinning because its failure
 * is silent in both directions: prefer the wrong side and an operator's upload
 * never appears (the bug this fixed — the switcher read it, the fifteen badge
 * call sites did not), or lose the fallback and every chain badge on the site
 * goes blank the first time admin-service is unreachable.
 */
import { describe, expect, it } from "vitest";
import { chainIconFrom, nativeIconFrom, type ChainBrand } from "./useChainBrand";

const RISE_ID = 11155931;
const ARC_ID = 5042002;
const UPLOADED = "/logo/aaaa.webp";

const brands = (rows: Partial<ChainBrand>[]): Record<string, ChainBrand> =>
  Object.fromEntries(
    rows.map((r) => [
      String(r.chainId),
      {
        chainId: r.chainId!,
        label: r.label ?? null,
        logoURI: r.logoURI ?? null,
        nativeCurrencyLogoURI: r.nativeCurrencyLogoURI ?? null,
        brandColorHex: r.brandColorHex ?? null,
      },
    ]),
  );

describe("chainIconFrom", () => {
  it("returns the operator's uploaded mark", () => {
    expect(chainIconFrom(brands([{ chainId: RISE_ID, logoURI: UPLOADED }]), "RISE Testnet")).toBe(
      UPLOADED,
    );
  });

  it("returns undefined when the chain has no uploaded mark", () => {
    // Not a broken image and not a placeholder URL — undefined is what makes
    // ChainBadge render its initials.
    expect(chainIconFrom(brands([{ chainId: RISE_ID, logoURI: null }]), "RISE Testnet")).toBeUndefined();
    expect(chainIconFrom(brands([]), "RISE Testnet")).toBeUndefined();
  });

  it("never yields null, even though the column is nullable", () => {
    // A chainMeta row exists for every chain an operator has touched and most
    // carry nulls. A null reaching `<img src>` stringifies to "null" and
    // requests /null — a 404 per row rather than a clean absence.
    const out = chainIconFrom(brands([{ chainId: RISE_ID, logoURI: null }]), "RISE Testnet");
    expect(out).not.toBeNull();
    expect(out).toBeUndefined();
  });

  it("returns undefined when the brand fetch failed entirely", () => {
    // `useChainBrand` degrades to an empty map on any failure. An unreachable
    // service costs the marks, never the page.
    expect(chainIconFrom(undefined, "RISE Testnet")).toBeUndefined();
  });

  it("keeps each chain's mark to its own chain", () => {
    const map = brands([
      { chainId: RISE_ID, logoURI: "/logo/rise.webp" },
      { chainId: ARC_ID, logoURI: "/logo/arc.webp" },
    ]);
    expect(chainIconFrom(map, "RISE Testnet")).toBe("/logo/rise.webp");
    expect(chainIconFrom(map, "Arc Testnet")).toBe("/logo/arc.webp");
  });

  it("resolves by NAME through the registry, not by a caller-supplied id", () => {
    // The repo does not agree with itself on every number — consts.chainIds puts
    // MegaETH at 6342 while deployments.json says 6343 — so every chain lookup
    // in this app goes name → registry → id. An unknown name yields nothing
    // rather than a confidently wrong mark.
    expect(chainIconFrom(brands([{ chainId: RISE_ID, logoURI: UPLOADED }]), "Nonexistent")).toBeUndefined();
  });

  it("is the ONLY source — there is no build-time icon to fall back to", () => {
    // This assertion has been through three shapes and the last one is the
    // point. It began as "the upload beats the built-in icon", became "there is
    // no built-in icon" when both `evmNetworks` entries turned out to be dead
    // pbs.twimg.com links, and is now "there is no fallback parameter at all" —
    // `getChainIconUrl` and the list behind it are deleted.
    expect(chainIconFrom(brands([{ chainId: RISE_ID, logoURI: UPLOADED }]), "RISE Testnet")).toBe(
      UPLOADED,
    );
    expect(chainIconFrom(brands([]), "RISE Testnet")).toBeUndefined();
  });
});

describe("nativeIconFrom", () => {
  const GAS_MARK = "/logo/gas.webp";
  const TOKEN_LIST = "https://example.test/eth.png";
  const map = brands([
    { chainId: RISE_ID, logoURI: "/logo/rise.webp", nativeCurrencyLogoURI: GAS_MARK },
    { chainId: ARC_ID, logoURI: "/logo/arc.webp", nativeCurrencyLogoURI: "/logo/arc-gas.webp" },
  ]);

  it("uses the gas mark for the chain's OWN gas token", () => {
    // RISE pays gas in ETH, and its ETH has no mark of its own — the case the
    // column was added for.
    expect(nativeIconFrom(map, "RISE Testnet", "ETH", TOKEN_LIST)).toBe(GAS_MARK);
  });

  it("recognises Arc's gas token, which is USDC", () => {
    // The reason this compares against the REGISTRY and not `isNativeSymbol`:
    // that list is ETH/NEON/INJ/IP/MON/STT and has never contained USDC, so it
    // does not know Arc has a gas asset at all.
    expect(nativeIconFrom(map, "Arc Testnet", "USDC", TOKEN_LIST)).toBe("/logo/arc-gas.webp");
  });

  it("leaves every OTHER token alone", () => {
    // A gas mark on a token that is not the gas token is simply a wrong image.
    expect(nativeIconFrom(map, "RISE Testnet", "USDC", TOKEN_LIST)).toBe(TOKEN_LIST);
    expect(nativeIconFrom(map, "Arc Testnet", "ETH", TOKEN_LIST)).toBe(TOKEN_LIST);
  });

  it("does NOT use the chain's own mark as the gas mark", () => {
    // The whole distinction. A chain with a logo but no gas mark keeps the token
    // list's image rather than borrowing the network's.
    const noGasMark = brands([{ chainId: RISE_ID, logoURI: "/logo/rise.webp" }]);
    expect(nativeIconFrom(noGasMark, "RISE Testnet", "ETH", TOKEN_LIST)).toBe(TOKEN_LIST);
  });

  it("substitutes nothing when the caller did not name a chain", () => {
    // Without a network this component cannot know which chain a token is on,
    // and the portfolio is cross-chain — guessing would put one chain's gas mark
    // on another chain's token.
    expect(nativeIconFrom(map, undefined, "ETH", TOKEN_LIST)).toBe(TOKEN_LIST);
  });

  it("is case-insensitive on the symbol but not credulous about the chain", () => {
    expect(nativeIconFrom(map, "RISE Testnet", " eth ", TOKEN_LIST)).toBe(GAS_MARK);
    expect(nativeIconFrom(map, "Nonexistent Network", "ETH", TOKEN_LIST)).toBe(TOKEN_LIST);
  });

  it("degrades to the fallback when the brand fetch failed", () => {
    expect(nativeIconFrom(undefined, "RISE Testnet", "ETH", TOKEN_LIST)).toBe(TOKEN_LIST);
  });

  it("passes an absent fallback straight through", () => {
    // Undefined is what makes TokenImageIcon render the logo mark rather than a
    // broken image element.
    expect(nativeIconFrom(brands([]), "RISE Testnet", "ETH", undefined)).toBeUndefined();
  });
});
