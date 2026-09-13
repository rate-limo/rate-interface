import { describe, expect, it } from "vitest";
import { isoTime, toHistoryRows, toLpPositions, toOpenOrders, toStopOrders, toTradeRows } from "./live";

const NET = "RISE Testnet";
const ME = "0xAAAAaaaAAAAaaaAAaAaAAAaAAAaaAAAAAAAaAaAa";
const THEM = "0xBBBBbbbBBBBbbbBBbBbBBBbBBBbbBBBBBBBbBbBb";

describe("toOpenOrders", () => {
  it("prefers the exact bigint columns for fill progress", () => {
    // amountBN/placedBN are the integers the chain dealt in; `placed` is a
    // float4 display estimate that can be stale.
    const [row] = toOpenOrders(
      [
        {
          isBid: true,
          baseSymbol: "ETH",
          quoteSymbol: "USDC",
          price: 2000,
          amount: 10,
          placed: 10,
          amountBN: "1000",
          placedBN: "400",
        },
      ],
      NET,
    );
    // 60% filled per the BN columns; the float columns alone would say 0%.
    expect(row.filledPct).toBeCloseTo(60, 6);
    expect(row.status).toBe("Partial");
  });

  it("is Open, not Partial, when nothing has filled", () => {
    const [row] = toOpenOrders(
      [{ isBid: false, baseSymbol: "ETH", quoteSymbol: "USDC", price: 1, amount: 5, placed: 5 }],
      NET,
    );
    expect(row.filledPct).toBe(0);
    expect(row.status).toBe("Open");
  });

  it("never reports 100%, because a cleared order is deleted rather than listed", () => {
    const [row] = toOpenOrders(
      [
        {
          isBid: true,
          baseSymbol: "ETH",
          quoteSymbol: "USDC",
          price: 1,
          amountBN: "1000",
          placedBN: "1",
        },
      ],
      NET,
    );
    expect(row.filledPct).toBeLessThan(100);
    expect(row.status).toBe("Partial");
  });

  it("maps isBid to a side and carries the market", () => {
    const [buy, sell] = toOpenOrders(
      [
        { isBid: true, baseSymbol: "ETH", quoteSymbol: "USDC", price: 1, amount: 1, placed: 1 },
        { isBid: false, baseSymbol: "WBTC", quoteSymbol: "USDC", price: 2, amount: 1, placed: 1 },
      ],
      NET,
    );
    expect(buy.side).toBe("Buy");
    expect(sell.side).toBe("Sell");
    expect(sell.market).toEqual({ base: "WBTC", quote: "USDC", network: NET });
  });
});

describe("toHistoryRows", () => {
  it("maps the broker's lowercase status values", () => {
    const rows = toHistoryRows(
      ["filled", "canceled", "cancelled", "expired", "open"].map((status, i) => ({
        isBid: true,
        baseSymbol: "ETH",
        quoteSymbol: "USDC",
        price: 1,
        amount: 1,
        timestamp: 1_700_000_000 + i,
        status,
      })),
      NET,
    );
    expect(rows.map((r) => r.status)).toEqual([
      "Filled",
      "Canceled",
      "Canceled",
      "Expired",
      "Open",
    ]);
  });

  it("falls back to Open for a missing or unknown status, never to Filled", () => {
    // Claiming a fill that did not happen is the one error here with
    // consequences for the reader.
    for (const status of [undefined, null, "", "something-new"]) {
      const [row] = toHistoryRows(
        [{ isBid: true, baseSymbol: "ETH", quoteSymbol: "USDC", price: 1, amount: 1, timestamp: 1, status }],
        NET,
      );
      expect(row.status).toBe("Open");
    }
  });
});

describe("toTradeRows", () => {
  it("reports the side from THIS wallet's point of view when it is the maker", () => {
    // isBid describes the taker. A maker whose resting sell was hit by a buy
    // has sold, and must not be shown as having bought.
    const [row] = toTradeRows(
      [
        {
          isBid: true,
          baseSymbol: "ETH",
          quoteSymbol: "USDC",
          price: 2000,
          baseAmount: 1,
          valueUSD: 2000,
          timestamp: 1_700_000_000,
          txHash: "0xabc",
          taker: THEM,
        },
      ],
      NET,
      ME,
    );
    expect(row.side).toBe("Sell");
  });

  it("agrees with isBid when this wallet is the taker", () => {
    const [row] = toTradeRows(
      [
        {
          isBid: true,
          baseSymbol: "ETH",
          quoteSymbol: "USDC",
          price: 1,
          baseAmount: 1,
          valueUSD: 1,
          timestamp: 1,
          txHash: "0x1",
          taker: ME,
        },
      ],
      NET,
      ME,
    );
    expect(row.side).toBe("Buy");
  });

  it("compares addresses case-insensitively", () => {
    const [row] = toTradeRows(
      [
        {
          isBid: false,
          baseSymbol: "ETH",
          quoteSymbol: "USDC",
          price: 1,
          baseAmount: 1,
          valueUSD: 1,
          timestamp: 1,
          txHash: "0x1",
          taker: ME.toLowerCase(),
        },
      ],
      NET,
      ME,
    );
    // Taker + isBid false => this wallet sold.
    expect(row.side).toBe("Sell");
  });

  it("carries the tx hash through untouched — it is the row's link out", () => {
    const [row] = toTradeRows(
      [
        {
          isBid: true,
          baseSymbol: "ETH",
          quoteSymbol: "USDC",
          price: 1,
          baseAmount: 1,
          valueUSD: 1,
          timestamp: 1,
          txHash: "0xDEADBEEF",
          taker: ME,
        },
      ],
      NET,
      ME,
    );
    expect(row.txHash).toBe("0xDEADBEEF");
  });
});

describe("isoTime", () => {
  it("accepts seconds and milliseconds alike", () => {
    // Broker timestamps are seconds; Date.now()-derived ones are milliseconds.
    // Treating seconds as ms dates every fill to 1970 — a plausible-looking
    // wrong answer rather than a visible failure.
    const seconds = 1_700_000_000;
    expect(isoTime(seconds)).toBe(new Date(seconds * 1000).toISOString());
    expect(isoTime(seconds * 1000)).toBe(new Date(seconds * 1000).toISOString());
  });

  it("renders a dash for a missing or nonsense timestamp", () => {
    expect(isoTime(0)).toBe("--");
    expect(isoTime(Number.NaN)).toBe("--");
    expect(isoTime(-1)).toBe("--");
  });
});

describe("toLpPositions", () => {
  const range = {
    base: "ETH",
    quote: "USDC",
    baseAmount: 2,
    quoteAmount: 4000,
    minPrice: 1800,
    maxPrice: 2200,
    active: true,
    inRange: true,
    pairSymbol: "ETH/USDC",
  };

  it("drops withdrawn ranges — the tab is positions, not their history", () => {
    expect(toLpPositions([{ ...range, active: false }], NET)).toEqual([]);
  });

  it("labels a two-sided range and lists both legs", () => {
    const [row] = toLpPositions([range], NET);
    expect(row.singleSided).toBe(false);
    expect(row.provided).toBe("2 ETH + 4000 USDC");
    expect(row.inRange).toBe(true);
  });

  it("uses the joined pair symbol instead of rendering pool token addresses", () => {
    const [row] = toLpPositions([{
      ...range,
      base: "0x008fCD6315c68EbAa31244aea174993f63Ef14D5",
      quote: "0x1f18a1724D8960f10165788dba3123F3f5623BB9",
    }], NET);
    expect(row.market).toEqual({ base: "ETH", quote: "USDC", network: NET });
    expect(row.provided).toBe("2 ETH + 4000 USDC");
  });

  it("marks a one-legged range single-sided — what the swap card's Earn opens", () => {
    const [base] = toLpPositions([{ ...range, quoteAmount: 0 }], NET);
    expect(base.singleSided).toBe(true);
    expect(base.provided).toBe("2 ETH");

    const [quote] = toLpPositions([{ ...range, baseAmount: 0 }], NET);
    expect(quote.singleSided).toBe(true);
    expect(quote.provided).toBe("4000 USDC");
  });

  it("reports APR as null, never 0, when the pool has no measurable figure", () => {
    // 0 asserts the pool earned nothing; null says it could not be measured.
    const [none] = toLpPositions([range], NET);
    expect(none.aprPct).toBeNull();

    const [unmeasurable] = toLpPositions([range], NET, new Map([["ETH/USDC", null]]));
    expect(unmeasurable.aprPct).toBeNull();
  });

  it("attaches the pool's APR by pair symbol", () => {
    const [row] = toLpPositions([range], NET, new Map([["ETH/USDC", 12.5]]));
    expect(row.aprPct).toBe(12.5);
  });

  it("keeps fees null — nothing in the stack accrues them per position", () => {
    const [row] = toLpPositions([range], NET, new Map([["ETH/USDC", 12.5]]));
    expect(row.feesEarnedUsd).toBeNull();
  });

  it("does not render an empty cell for a range with neither leg funded", () => {
    const [row] = toLpPositions([{ ...range, baseAmount: 0, quoteAmount: 0 }], NET);
    expect(row.provided).toBe("--");
  });
});

describe("toStopOrders", () => {
  const base = {
    orderId: 7,
    pair: "0x14357De34Cd0c7Aa81CB888bCB2ebE46333bcA60",
    base: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    quote: "0x3600000000000000000000000000000000000000",
    baseSymbol: "EURC",
    quoteSymbol: "USDC",
    isBid: true,
    isMarket: false,
    stopPriceBN: 11000000000,
    limitPriceBN: 12000000000,
    amountBN: "2000000",
    assetDecimals: 6,
    deadline: 0,
  };

  it("carries the id of the book order an activated stop became", () => {
    // An activated stop stops being a stop -- StopOrderEngine.cancel reverts for
    // it and it is managed through MatchingEngine.cancelOrder. The chain emits
    // this id on StopOrderActivated so a client can make that hand-off visible.
    const [row] = toStopOrders([{ ...base, status: "activated", regularOrderId: 42 }], NET);
    expect(row.status).toBe("Activated");
    expect(row.regularOrderId).toBe(42);
  });

  it("leaves the id null on a dormant stop rather than collapsing it to order 0", () => {
    // The broker only writes regularOrderId on activation, so it is absent here.
    // `finite` would turn that into 0, which names a real order.
    const [row] = toStopOrders([{ ...base, status: "open" }], NET);
    expect(row.status).toBe("Open");
    expect(row.regularOrderId).toBeNull();
  });

  it("treats regularOrderId 0 as absent — a stop-market never became an order", () => {
    // _process emits 0 on the market branch, and ids start at 1 on both sides, so
    // 0 is the contract saying "none". Passed through it renders "View order #0".
    const [row] = toStopOrders([{ ...base, isMarket: true, status: "activated", regularOrderId: 0 }], NET);
    expect(row.status).toBe("Activated");
    expect(row.regularOrderId).toBeNull();
  });

  it("leaves the id null on a cancelled stop", () => {
    const [row] = toStopOrders([{ ...base, status: "canceled" }], NET);
    expect(row.status).toBe("Canceled");
    expect(row.regularOrderId).toBeNull();
  });
});

describe("toLpPositions — band positions", () => {
  const band = {
    pool: "0xpool",
    positionId: "1",
    tokenId: "1",
    band: 0,
    shares: 0.05,
    base: "0xbase",
    quote: "0xquote",
    pairSymbol: "SKHY/USDC",
    price: 1,
  };

  it("appends bands after ranges and marks which is which", () => {
    // The two are different generations of pool, and the table renders them
    // differently — a band has no range to draw and no per-leg amounts.
    const out = toLpPositions([], NET, new Map(), [band]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("band");
    expect(out[0]!.market).toEqual({ base: "SKHY", quote: "USDC", network: NET });
  });

  it("labels the stake as SHARES, never as a token amount", () => {
    // A share count has no decimals of its own — the pool's accounting scale is
    // what it is — so rendering it as "0.05 SKHY" would be a category error.
    const out = toLpPositions([], NET, new Map(), [band]);
    expect(out[0]!.provided).toMatch(/shares/);
    expect(out[0]!.provided).toContain("band 0");
  });

  it("abbreviates a raw share count instead of printing 17 digits", () => {
    // A 0.05 deposit mints 5e16 shares. The exact figure lives in `sharesBN`;
    // this column has to be readable.
    const out = toLpPositions([], NET, new Map(), [{ ...band, shares: 5e16 }]);
    expect(out[0]!.provided).toContain("50P");
    expect(out[0]!.provided).not.toContain("50000000000000000");
  });

  it("reports no APR rather than zero", () => {
    // Pool-level APR is keyed by pair and band pools are absent from that
    // source, so there is nothing to look up. Zero would assert the band earned
    // nothing, which is a measurement nobody took.
    const out = toLpPositions([], NET, new Map(), [band]);
    expect(out[0]!.aprPct).toBeNull();
    expect(out[0]!.feesEarnedUsd).toBeNull();
  });

  it("falls back to the raw addresses when the pair is unresolved", () => {
    const out = toLpPositions([], NET, new Map(), [{ ...band, pairSymbol: null }]);
    expect(out[0]!.market.base).toBe("0xbase");
  });

  it("leaves the range half untouched", () => {
    // Additive: a wallet with only v3 ranges sees exactly what it saw before.
    const before = toLpPositions([], NET);
    expect(before).toEqual([]);
  });
});
