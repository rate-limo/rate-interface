import { describe, expect, it } from "vitest";
import { tradeRowKey } from "./identity";

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
