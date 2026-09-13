import { describe, expect, it } from "vitest";
import { foldIndexedCoins, type IndexedCoinBalance } from "./indexedCoins";
import type { TokenBalance } from "./types";

const rpc = (symbol: string, usdValue = 1): TokenBalance => ({
  symbol,
  name: symbol,
  amount: "1",
  usdValue,
});

const coin = (over: Partial<IndexedCoinBalance> = {}): IndexedCoinBalance => ({
  token: "0xAAA",
  symbol: "NOVA",
  name: "Nova",
  decimals: 18,
  logoURI: null,
  balance: 5,
  valueUSD: 10,
  launched: true,
  ...over,
});

describe("foldIndexedCoins", () => {
  it("adds a launched coin the RPC read never saw", () => {
    const out = foldIndexedCoins([rpc("ETH")], [coin()], ["0xETH"]);
    expect(out.map((t) => t.symbol)).toEqual(["ETH", "NOVA"]);
  });

  it("never double-counts a coin present in both sources", () => {
    // The whole reason this function exists: a launched coin that also got
    // listed is in the token list AND in tokenBalances. Concatenating shows it
    // twice and sums it twice, which is worse than either source alone.
    const out = foldIndexedCoins([rpc("NOVA", 10)], [coin({ token: "0xAAA" })], ["0xaaa"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.usdValue).toBe(10);
  });

  it("matches case-insensitively, because broker columns are checksummed", () => {
    const out = foldIndexedCoins([rpc("NOVA")], [coin({ token: "0xaaa" })], ["0xAAA"]);
    expect(out).toHaveLength(1);
  });

  it("ignores a coin that did not come from the generator", () => {
    // Its Transfer log may be partial, and a partial balance is worse than an
    // absent one: absent shows nothing, partial shows a wrong number.
    const out = foldIndexedCoins([], [coin({ launched: false })], []);
    expect(out).toEqual([]);
  });

  it("drops a zero balance, which is history rather than a holding", () => {
    const out = foldIndexedCoins([], [coin({ balance: 0 })], []);
    expect(out).toEqual([]);
  });

  it("does not re-scale an already decimal-scaled balance", () => {
    // `tokenBalances.balance` is stored in whole units. Running formatUnits over
    // it would divide by decimals a second time.
    const out = foldIndexedCoins([], [coin({ balance: 1234.5 })], []);
    expect(out[0]!.amount).toBe("1,234.5");
  });

  it("keeps a dust balance visible rather than rounding it to 0", () => {
    const out = foldIndexedCoins([], [coin({ balance: 1e-9 })], []);
    expect(out[0]!.amount).toBe("<0.000001");
  });
});

describe("foldIndexedCoins during the coverage handover", () => {
  it("still shows one row while the RPC plan has not yet narrowed", () => {
    // `useBalances` drops covered coins from the RPC plan, but coverage arrives
    // from a query — so for one render both rows exist. A flicker that doubles
    // someone's balance is worse than a slow one.
    const out = foldIndexedCoins([rpc("NOVA", 42)], [coin({ token: "0xAAA" })], ["0xAAA"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.usdValue).toBe(42);
  });

  it("takes over cleanly once the RPC row is gone", () => {
    const out = foldIndexedCoins([], [coin({ token: "0xAAA", valueUSD: 10 })], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.usdValue).toBe(10);
  });
});
