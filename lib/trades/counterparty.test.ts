import { describe, expect, it } from "vitest";
import { counterpartyAddresses, counterpartyOf, shortWallet } from "./counterparty";

const ME = "0x1111111111111111111111111111111111111111";
const A = "0xAaAa000000000000000000000000000000000001";
const B = "0xbBbB000000000000000000000000000000000002";
const POOL = "0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99";

describe("counterpartyOf — the gateway's explicit set", () => {
  it("one trader is that trader, by short address until a name arrives", () => {
    const v = counterpartyOf({ counterparties: [A], counterpartyCount: 1, poolAddress: null, fills: 1 }, ME);
    expect(v.kind).toBe("trader");
    expect(v.traders).toEqual([A]);
    expect(v.label).toBe("0xAaAa…0001");
  });

  it("the pool alone is Pool, carrying its address for the link", () => {
    const v = counterpartyOf({ counterparties: [], counterpartyCount: 0, poolAddress: POOL, fills: 2 }, ME);
    expect(v).toMatchObject({ kind: "pool", label: "Pool", pool: { address: POOL } });
  });

  it("several traders read as a count, and the pool joins it", () => {
    expect(counterpartyOf({ counterparties: [A, B], counterpartyCount: 2, poolAddress: null, fills: 3 }, ME).label).toBe(
      "2 traders",
    );
    const mixed = counterpartyOf({ counterparties: [A], counterpartyCount: 1, poolAddress: POOL, fills: 2 }, ME);
    expect(mixed).toMatchObject({ kind: "many", label: "Pool + 1 trader", traders: [A] });
  });

  it("past the cap, the count is the gateway's and the rest is 'more'", () => {
    const five = [A, B, "0x3", "0x4", "0x5"];
    const v = counterpartyOf({ counterparties: five, counterpartyCount: 8, poolAddress: null, fills: 9 }, ME);
    expect(v.label).toBe("8 traders");
    expect(v.more).toBe(3);
  });

  it("an empty set on a trader fill is a self-match, not unknown", () => {
    const v = counterpartyOf(
      { counterparties: [], counterpartyCount: 0, poolAddress: null, origins: { pool: 0, maker: 1 }, fills: 1, maker: ME, taker: ME },
      ME,
    );
    expect(v).toMatchObject({ kind: "self", label: "You" });
  });

  it("never reads `maker` on a multi-fill row: it is min(maker), not THE counterparty", () => {
    const v = counterpartyOf({ fills: 3, maker: A, taker: ME, origins: { pool: 0, maker: 3 } }, ME);
    expect(v).toMatchObject({ kind: "legacy", label: "Trader", traders: [] });
  });
});

describe("counterpartyOf — one fill, from the viewer's side", () => {
  it("a taker's counterparty is the maker", () => {
    expect(counterpartyOf({ taker: ME, maker: A, makerOrderId: 4 }, ME)).toMatchObject({ kind: "trader", traders: [A] });
  });

  it("a maker's counterparty is the taker — never themselves", () => {
    expect(counterpartyOf({ taker: B, maker: ME, makerOrderId: 4 }, ME)).toMatchObject({ kind: "trader", traders: [B] });
  });

  it("a fill that consumed no resting order is the pool, by makerOrderId or origin", () => {
    expect(counterpartyOf({ taker: ME, maker: POOL, makerOrderId: null }, ME)).toMatchObject({
      kind: "pool",
      pool: { address: POOL },
    });
    expect(counterpartyOf({ taker: ME, maker: POOL, orderId: 0 }, ME).kind).toBe("pool");
    expect(counterpartyOf({ taker: ME, maker: POOL, origin: "pool" }, ME).kind).toBe("pool");
  });

  it("a per-fill origin with no addresses still says Pool or Trader", () => {
    expect(counterpartyOf({ origin: "pool" }).kind).toBe("pool");
    expect(counterpartyOf({ origin: "maker" })).toMatchObject({ kind: "legacy", label: "Trader" });
  });
});

describe("counterpartyOf — older gateways and nothing at all", () => {
  it("falls back to origins counts, unlinked", () => {
    expect(counterpartyOf({ fills: 3, origins: { pool: 1, maker: 2 } }, ME)).toMatchObject({
      kind: "legacy",
      label: "Pool + Trader",
      pool: { address: null },
    });
  });

  it("a row that says nothing is a dash", () => {
    expect(counterpartyOf({ fills: 2 }, ME)).toMatchObject({ kind: "none", label: "—" });
  });
});

describe("counterpartyAddresses", () => {
  it("includes the traders behind a 'N traders' toggle, so opening it asks for nothing", () => {
    const views = [
      counterpartyOf({ counterparties: [A, B], counterpartyCount: 2, poolAddress: null, fills: 2 }, ME),
      counterpartyOf({ taker: ME, maker: POOL, makerOrderId: null }, ME),
    ];
    expect(counterpartyAddresses(views)).toEqual([A, B]);
  });
});

it("shortWallet keeps a non-address as it is", () => {
  expect(shortWallet("0xabc")).toBe("0xabc");
});
