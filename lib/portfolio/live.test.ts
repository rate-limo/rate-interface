import type { LpToken } from "@/lib/liquidity/positions";
import { describe, expect, it } from "vitest";
import { isoTime, toCreatorTokens, toHistoryRows, toLpPositions, toOpenOrders, toStopOrders, toTradeRows } from "./live";

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

  it("labels a float-drifted row ≈100%, never 100%, because it is still open on chain", () => {
    // No exact columns, and float4 `placed` has rounded to 0 while a remainder
    // still rests: the arithmetic says 100, and the Portfolio tab printed it.
    const [row] = toOpenOrders(
      [{ isBid: true, baseSymbol: "ETH", quoteSymbol: "USDC", price: 1, amount: 1, placed: 0 }],
      NET,
    );
    expect(row.fill?.label).toBe("≈100%");
    expect(row.fill?.title).toMatch(/Still open on chain/);
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

  it("keeps a RANGE's fees null — no accrual exists for that generation", () => {
    // Only bands have a fee source. `Pool.sol` positions have none in broker,
    // gateway or chain view, so null is the honest answer and stays one.
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

describe("toLpPositions — LP tokens (v2: one token, the whole ladder)", () => {
  const token = (over: Partial<LpToken> = {}): LpToken => ({
    tokenId: "1",
    networkName: NET,
    pool: "0xpool",
    base: "0xbase",
    quote: "0xquote",
    baseSymbol: "SKHY",
    quoteSymbol: "USDC",
    baseDecimals: 18,
    quoteDecimals: 6,
    active: true,
    bands: [
      { band: 0, spreadFrac: 0.2, toleranceBuy: 0.0002, toleranceSell: 0.0002, feeMultiplier: 1, open: true, shares: BigInt(1), sharePct: 50, valueUSD: 5, baseOwned: BigInt(0), quoteOwned: BigInt(0), vestedPct: 100 },
      { band: 2, spreadFrac: 1, toleranceBuy: 0.001, toleranceSell: 0.001, feeMultiplier: 3, open: true, shares: BigInt(1), sharePct: 50, valueUSD: 5, baseOwned: BigInt(0), quoteOwned: BigInt(0), vestedPct: 100 },
    ],
    valueUSD: 10,
    costUSD: 9,
    unrealizedPnlUSD: 1,
    realizedPnlUSD: 0,
    feesUSD: 0,
    forfeitedUSD: 0,
    claimableBase: BigInt(0),
    claimableQuote: BigInt(0),
    vestingBase: BigInt(0),
    vestingQuote: BigInt(0),
    vestedPct: 100,
    live: true,
    mintedAt: 1,
    snapshotAt: 1,
    ...over,
  });

  it("is ONE row per token, with the token's bands inside it", () => {
    const out = toLpPositions([], NET, new Map(), [token()]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("band");
    expect(out[0]!.tokenId).toBe("1");
    expect(out[0]!.bands?.map((b) => b.band)).toEqual([0, 2]);
    expect(out[0]!.provided).toBe("#1 · 2 bands");
    expect(out[0]!.market).toEqual({ base: "SKHY", quote: "USDC", network: NET });
  });

  it("carries the distribution by value and the live width", () => {
    const [row] = toLpPositions([], NET, new Map(), [token()]);
    expect(row!.bands?.[0]).toEqual({ band: 0, sharePct: 50, width: 0.0002, feeMultiplier: 1 });
  });

  it("attaches the POOL's APR, keyed on the pair like a range", () => {
    // A pool holding both generations must not report two different APRs.
    const out = toLpPositions([], NET, new Map([["SKHY/USDC", 4.2]]), [token()]);
    expect(out[0]!.aprPct).toBe(4.2);
  });

  it("reports no APR rather than zero when the pool has no measurable figure", () => {
    expect(toLpPositions([], NET, new Map(), [token()])[0]!.aprPct).toBeNull();
    expect(toLpPositions([], NET, new Map([["SKHY/USDC", null]]), [token()])[0]!.aprPct).toBeNull();
  });

  it("distinguishes a measured zero in fees from an unmeasured one", () => {
    expect(toLpPositions([], NET, new Map(), [token()], new Map([["1", 0]]))[0]!.feesEarnedUsd).toBe(0);
    expect(toLpPositions([], NET, new Map(), [token()], new Map([["1", null]]))[0]!.feesEarnedUsd).toBeNull();
    expect(toLpPositions([], NET, new Map(), [token()])[0]!.feesEarnedUsd).toBeNull();
  });

  it("values the token from the gateway's own SQL, summed over its bands", () => {
    expect(toLpPositions([], NET, new Map(), [token()])[0]!.valueUsd).toBe(10);
  });

  it("leaves out a closed token -- it is history, not a holding", () => {
    expect(toLpPositions([], NET, new Map(), [token({ active: false })])).toHaveLength(0);
  });
});

describe("toCreatorTokens — seeded liquidity reads the pool, not only the book", () => {
  const token = { id: "0x399CaD0F90E8b85aA225BB4E6DE648Df656e8f96", symbol: "LQN1TNG", name: "E2E", totalSupply: 1_000_000_000, listingDate: 1790925923 };

  it("before graduation: the ladder's resting asks on the book, empty pool", () => {
    const pairs = new Map([["LQN1TNG", { id: "0xpair", quoteSymbol: "tUSD", price: 0.000001, dayBaseTvl: 800_000_000, dayBaseTvlUSD: 800, dayQuoteTvlUSD: 0 }]]);
    const pools = new Map([[token.id.toLowerCase(), { poolBase: 0, poolQuote: 0, valueUsd: 0, takerFeeNum: 1_000_000 }]]);
    const [row] = toCreatorTokens([token], "RISE Testnet", pairs, pools);
    expect(row.seededUsd).toBe(800);
    expect(row.poolPct).toBe(80);
    expect(row.feeTierPct).toBe(1);
    expect(row.feeTierRead).toBe(true);
    expect(row.takerFeeNum).toBe(1_000_000);
  });

  it("after graduation: the book is empty and the pool holds it all (the $0 bug)", () => {
    const pairs = new Map([["LQN1TNG", { id: "0xpair", quoteSymbol: "tUSD", price: 0.000005, dayBaseTvl: 0, dayBaseTvlUSD: 0, dayQuoteTvlUSD: 0 }]]);
    const pools = new Map([[token.id.toLowerCase(), { poolBase: 190_000_000, poolQuote: 2104.4, valueUsd: 3054.4, takerFeeNum: 1_000_000 }]]);
    const [row] = toCreatorTokens([token], "RISE Testnet", pairs, pools);
    expect(row.seededUsd).toBeCloseTo(3054.4, 6);
    expect(row.poolAmount).toBe("190,000,000");
    expect(row.poolPct).toBe(19);
  });

  it("no chain read: falls back to the book and marks the fee as a placeholder", () => {
    const pairs = new Map([["LQN1TNG", { id: "0xpair", quoteSymbol: "tUSD", price: 0.000005, dayBaseTvl: 0, dayBaseTvlUSD: 0, dayQuoteTvlUSD: 0 }]]);
    const [row] = toCreatorTokens([token], "RISE Testnet", pairs);
    expect(row.seededUsd).toBe(0);
    expect(row.feeTierRead).toBe(false);
    expect(row.takerFeeNum).toBe(100_000);
  });
});
