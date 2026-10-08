import { describe, expect, it } from "vitest";
import {
  collapseFillSummary,
  eventToSpotTradeStream,
  makerOrderIdFromWire,
  streamToSpotTradeEvent,
  summarizeFills,
  type SpotFillSummaryEvent,
  type SpotTradeEvent,
} from "@iter/types";
import { makerOrderIdOf, tradeRowKey } from "./identity";

const TX = "0xabc";
const PAIR_A = "0x1111111111111111111111111111111111111111";
const PAIR_B = "0x2222222222222222222222222222222222222222";

describe("tradeRowKey", () => {
  it("identifies the same fill across a re-encode", () => {
    expect(tradeRowKey({ txHash: TX, pair: PAIR_A, orderId: 7 })).toBe(
      tradeRowKey({ txHash: TX.toUpperCase(), pair: PAIR_A.toUpperCase(), orderId: 7 }),
    );
  });

  /* The corruption this exists to stop: orderId is an orderbook sequence number,
   * so a wallet's own resting order 7 and some stranger's order 7 hit in a later
   * transaction collide on it. Keyed on orderId alone, the second overwrote the
   * first — flipping a maker row into a taker one. */
  it("does not confuse the same orderId in a different transaction", () => {
    expect(tradeRowKey({ txHash: "0xdef", pair: PAIR_A, orderId: 7 })).not.toBe(
      tradeRowKey({ txHash: TX, pair: PAIR_A, orderId: 7 }),
    );
  });

  it("does not confuse the same orderId on a different book in ONE transaction", () => {
    // A routed multi-hop swap settles across several pairs in one tx, and each
    // book numbers its orders independently.
    expect(tradeRowKey({ txHash: TX, pair: PAIR_B, orderId: 7 })).not.toBe(
      tradeRowKey({ txHash: TX, pair: PAIR_A, orderId: 7 })
    );
  });

  it("still separates rows when a field is missing rather than collapsing them", () => {
    expect(tradeRowKey({ orderId: 7 })).not.toBe(tradeRowKey({ txHash: TX, pair: PAIR_A, orderId: 7 }));
  });
});

/* A REST row and a live frame for the same fill must key identically, or the
 * fill renders twice until the next refetch (the bug 91ac1757 fixed for pool
 * fills). The web deploys BEFORE the gateway, so for a while REST rows come
 * from a gateway that sends only the legacy `orderId` (0 for the pool), and
 * after it, from one that sends `makerOrderId` (null for the pool). Every pair
 * of {new REST, old REST, live frame} must agree, for every shape of fill. */
describe("tradeRowKey: REST and live rows for one fill", () => {
  const PAIR = "0x1111111111111111111111111111111111111111";
  const fill = (orderId: number, maker: string): SpotTradeEvent => ({
    eventId: "spotTrade",
    orderId,
    base: "0xb",
    quote: "0xq",
    baseSymbol: "B",
    quoteSymbol: "Q",
    baseLogoURI: "",
    quoteLogoURI: "",
    pair: PAIR,
    pairSymbol: "B/Q",
    isBid: true,
    price: 1,
    account: "0xtaker",
    asset: "0xq",
    assetSymbol: "Q",
    amount: 1,
    valueUSD: 1,
    baseAmount: 1,
    quoteAmount: 1,
    baseFee: 0,
    quoteFee: 0,
    timestamp: 1,
    taker: "0xtaker",
    maker,
    txHash: TX,
    updatedAt: 1,
  });

  /** What the gateway's SQL returns for the group: min(orderId), 0 included. */
  const sqlMin = (fills: SpotTradeEvent[]) => Math.min(...fills.map((f) => f.orderId));
  /** useTradeHistory's mapping of a REST row, from a current gateway… */
  const restNew = (orderId: number) => {
    const row = { txHash: TX, pair: PAIR, orderId, makerOrderId: makerOrderIdFromWire(orderId) };
    return { ...row, makerOrderId: makerOrderIdOf(row) };
  };
  /** …and from a gateway that predates makerOrderId. */
  const restOld = (orderId: number) => {
    const row = { txHash: TX, pair: PAIR, orderId };
    return { ...row, makerOrderId: makerOrderIdOf(row) };
  };

  const cases: [string, SpotTradeEvent[], number | null][] = [
    ["a book fill", [fill(7, "0xmaker")], 7],
    ["a pool fill", [fill(0, "0xpool")], null],
    ["a sweep across two resting orders", [fill(9, "0xa"), fill(4, "0xb")], 4],
    // min(orderId) hits the pool's 0 on both sides. The row's makerOrderId is
    // null even though one fill was a trader — `origins` says how it filled.
    ["a sweep mixing the pool and the book", [fill(9, "0xa"), fill(0, "0xpool")], null],
  ];

  for (const [name, fills, expected] of cases) {
    it(name, () => {
      const summary = summarizeFills(fills) as SpotFillSummaryEvent;
      const frame = collapseFillSummary(summary);
      const keys = {
        restNew: tradeRowKey(restNew(sqlMin(fills))),
        restOld: tradeRowKey(restOld(sqlMin(fills))),
        frame: tradeRowKey(frame),
      };
      expect(frame.makerOrderId).toBe(expected);
      expect(keys.restOld, "old-gateway REST vs new-gateway REST").toBe(keys.restNew);
      expect(keys.frame, "live envelope vs REST").toBe(keys.restNew);
    });
  }

  it("a single per-fill frame (pre-envelope gateway) keys like its REST row", () => {
    for (const f of [fill(7, "0xmaker"), fill(0, "0xpool")]) {
      const decoded = streamToSpotTradeEvent(eventToSpotTradeStream(f));
      expect(tradeRowKey(decoded)).toBe(tradeRowKey(restNew(f.orderId)));
      expect(tradeRowKey(decoded)).toBe(tradeRowKey(restOld(f.orderId)));
    }
  });

  it("a pool fill never keys as order 0", () => {
    expect(tradeRowKey(restOld(0))).toBe(`${TX}:${PAIR}:`);
    expect(tradeRowKey({ txHash: TX, pair: PAIR, makerOrderId: null, orderId: 0 })).toBe(`${TX}:${PAIR}:`);
  });

  it("prefers makerOrderId over the legacy orderId when both are present", () => {
    expect(makerOrderIdOf({ makerOrderId: 5, orderId: 0 })).toBe(5);
    expect(makerOrderIdOf({ makerOrderId: null, orderId: 5 })).toBeNull();
    expect(makerOrderIdOf({ orderId: 5 })).toBe(5);
  });
});
