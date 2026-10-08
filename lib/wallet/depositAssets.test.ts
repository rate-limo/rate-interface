import { describe, expect, it } from "vitest";
import {
  defaultDepositAssets,
  hasDistinctNativeAsset,
  needsAddress,
  searchDepositAssets,
} from "./depositAssets";
import type { SpotTokenWithBalance } from "@/types/tables/tokens";

const token = (over: Partial<SpotTokenWithBalance>): SpotTokenWithBalance =>
  ({
    id: "0x0000000000000000000000000000000000000001",
    symbol: "TKN",
    name: "Token",
    creator: "",
    verified: false,
    balance: 0,
  }) as unknown as SpotTokenWithBalance;

const make = (o: Partial<SpotTokenWithBalance>) =>
  ({ ...token({}), ...o }) as SpotTokenWithBalance;

const USDC = make({ id: "0xaaa1", symbol: "USDC", verified: true, creator: "" });
const PHNX = make({ id: "0xbbb2", symbol: "PHNX", verified: true, creator: "0xdead" });
const SCAM = make({ id: "0xccc3", symbol: "USDC", verified: false, creator: "0xbeef" });
const MINE = make({ id: "0xddd4", symbol: "MINE", verified: false, creator: "0xbeef", balance: 5 });

/**
 * The default list is a SAFETY filter. Every case here is one where showing the
 * wrong row costs money that cannot be recovered — a deposit goes to an address,
 * and an address cannot be un-sent.
 */
describe("defaultDepositAssets", () => {
  it("never shows an unverified token you do not hold", () => {
    // The whole point: SCAM is called USDC and is not the real one.
    const list = defaultDepositAssets([USDC, SCAM]);
    expect(list.map((a) => a.token.id)).toEqual(["0xaaa1"]);
  });

  it("shows what you HOLD even when it is unverified", () => {
    // A balance is the strongest statement that this is a token you deal with.
    // Hiding something someone owns behind a search would be absurd.
    const list = defaultDepositAssets([USDC, MINE]);
    expect(list.map((a) => a.token.id)).toContain("0xddd4");
    expect(list[0]!.trust).toBe("held");
  });

  it("labels a graduated launch differently from an operator listing", () => {
    // Both are `verified` — the flag is false until the market meets the
    // quote-liquidity threshold, so graduating SETS it. `creator` is what says
    // which kind it is, and it is only a label.
    const list = defaultDepositAssets([USDC, PHNX]);
    expect(list.find((a) => a.token.id === "0xaaa1")!.trust).toBe("verified");
    expect(list.find((a) => a.token.id === "0xbbb2")!.trust).toBe("graduated");
  });

  it("lists a held token once, not twice", () => {
    const verifiedAndHeld = make({ id: "0xeee5", symbol: "W", verified: true, balance: 2 });
    expect(defaultDepositAssets([verifiedAndHeld])).toHaveLength(1);
  });
});

describe("searchDepositAssets", () => {
  it("reaches the unverified tail, which the default list hides", () => {
    expect(searchDepositAssets([USDC, SCAM], "usdc").map((a) => a.token.id)).toEqual([
      "0xaaa1",
      "0xccc3",
    ]);
  });

  it("puts the trustworthy match ABOVE the impostor", () => {
    // Ordering is the safety property: a search for "usdc" must not put a
    // look-alike first purely because it sorted earlier in the source list.
    const results = searchDepositAssets([SCAM, USDC], "usdc");
    expect(results[0]!.token.id).toBe("0xaaa1");
    expect(results[0]!.trust).toBe("verified");
  });

  it("matches on address, because a symbol is not an identity here", () => {
    expect(searchDepositAssets([SCAM], "0xccc3")).toHaveLength(1);
  });

  it("returns nothing for an empty query, so the default list stands", () => {
    expect(searchDepositAssets([USDC], "   ")).toEqual([]);
  });

  it("demands an address only for the rows that need one", () => {
    expect(needsAddress("unverified")).toBe(true);
    expect(needsAddress("verified")).toBe(false);
    expect(needsAddress("graduated")).toBe(false);
    expect(needsAddress("held")).toBe(false);
  });
});

describe("hasDistinctNativeAsset", () => {
  it("is false on Arc, where the gas asset IS the USDC ERC-20", () => {
    // The whole bug: a synthesised native row here duplicates the USDC already
    // in the listed tokens, so the deposit list offers USDC twice — one row at
    // the 18-decimal native view, one at the ERC-20's 6.
    expect(hasDistinctNativeAsset("Arc Testnet")).toBe(false);
  });

  it("is true on RISE, where ETH is a genuinely separate asset", () => {
    expect(hasDistinctNativeAsset("RISE Testnet")).toBe(true);
  });

  it("is true for a chain the token list does not know", () => {
    // The safe direction. The gas asset is the one thing a new wallet cannot do
    // without, and dropping it on the strength of an ABSENT list entry is a
    // worse failure than showing one row too many.
    expect(hasDistinctNativeAsset("Some Chain Nobody Listed")).toBe(true);
  });
});

/*
 * `verified` means GRADUATED, so on a freshly deployed chain it is false for
 * everything — including the asset the venue settles in. The deposit screen
 * showed "No assets available yet" while offering nine searchable tokens.
 */
describe("the settlement asset is always offered", () => {
  const USDC = {
    id: "0x3600000000000000000000000000000000000000",
    symbol: "USDC",
    name: "USD Coin",
    verified: false,
    creator: "",
    balance: "0",
  } as unknown as SpotTokenWithBalance;
  const impostor = {
    id: "0xdeadbeef00000000000000000000000000000001",
    symbol: "USDC",
    name: "USD Coin",
    verified: false,
    creator: "0xsomeone",
    balance: "0",
  } as unknown as SpotTokenWithBalance;
  const settlement = new Set([USDC.id.toLowerCase()]);

  it("lists the deployment's own asset even though it is unverified", () => {
    const rows = defaultDepositAssets([USDC], settlement);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token.id).toBe(USDC.id);
  });

  it("does NOT badge it as unverified — nobody can mint into that address", () => {
    expect(defaultDepositAssets([USDC], settlement)[0]!.trust).toBe("verified");
  });

  it("matches on the ADDRESS, so a same-symbol impostor stays behind search", () => {
    const rows = defaultDepositAssets([impostor, USDC], settlement);
    expect(rows.map((r) => r.token.id)).toEqual([USDC.id]);
  });

  it("still hides an unverified token when no settlement set is given", () => {
    expect(defaultDepositAssets([USDC])).toHaveLength(0);
  });
});
