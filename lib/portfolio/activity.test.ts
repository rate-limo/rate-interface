import { describe, expect, it } from "vitest";
import { activityCounts, filterActivity, mergeActivity } from "./activity";
import { swapRate, toSwapRows } from "./swaps";
import type { ActivityRow, SwapRow, TradeRow } from "./types";

const NET = "RISE Testnet";

function swap(over: Partial<SwapRow> = {}): SwapRow {
  return {
    kind: "swap",
    network: NET,
    payAmount: "1.5",
    paySymbol: "ETH",
    receiveAmount: "3041.2",
    receiveSymbol: "USDC",
    rate: "2027.4666666666667",
    time: "2026-08-08T14:22:00.000Z",
    txHash: "0xsweep",
    ...over,
  };
}

function order(over: Partial<TradeRow> = {}): TradeRow {
  return {
    kind: "order",
    market: { base: "ETH", quote: "USDC", network: NET },
    side: "Buy",
    price: "2027",
    amount: "1.5",
    valueUsd: "3041",
    time: "2026-08-08T14:22:00.000Z",
    txHash: "0xsweep",
    ...over,
  };
}

describe("mergeActivity", () => {
  /* The whole reason this module exists. spotSwaps has one row per route and
   * spotTrades has one per fill; both are fetched, so concatenating lists the
   * same money twice — once as the swap, once as the trade its fills grouped
   * into. Totalling a history would then disagree with the wallet. */
  it("shows a swap ONCE, not also as the order underneath it", () => {
    const rows = mergeActivity([swap()], [order()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("swap");
  });

  it("ignores hash case when deduping", () => {
    const rows = mergeActivity([swap({ txHash: "0xSWEEP" })], [order({ txHash: "0xsweep" })]);
    expect(rows).toHaveLength(1);
  });

  it("keeps an order that was not part of any swap", () => {
    const rows = mergeActivity([swap()], [order({ txHash: "0xother" })]);
    expect(rows).toHaveLength(2);
  });

  /* A row we cannot identify must not be dropped — that would silently shrink a
   * history, which is worse than showing it twice. */
  it("keeps an order with no txHash rather than guessing", () => {
    const rows = mergeActivity([swap()], [order({ txHash: "" })]);
    expect(rows).toHaveLength(2);
  });

  it("orders newest first", () => {
    const rows = mergeActivity(
      [swap({ txHash: "0xa", time: "2026-08-01T00:00:00.000Z" })],
      [order({ txHash: "0xb", time: "2026-08-07T00:00:00.000Z" })],
    );
    expect(rows[0]!.txHash).toBe("0xb");
  });

  it("is stable when two rows share a timestamp", () => {
    const a = mergeActivity([], [order({ txHash: "0xb" }), order({ txHash: "0xa" })]);
    const b = mergeActivity([], [order({ txHash: "0xa" }), order({ txHash: "0xb" })]);
    expect(a.map((r) => r.txHash)).toEqual(b.map((r) => r.txHash));
  });
});

describe("filterActivity", () => {
  const rows: ActivityRow[] = [swap({ txHash: "0x1" }), order({ txHash: "0x2" })];

  it("narrows to one kind", () => {
    expect(filterActivity(rows, "swaps")).toHaveLength(1);
    expect(filterActivity(rows, "orders")).toHaveLength(1);
    expect(filterActivity(rows, "all")).toHaveLength(2);
  });
});

describe("activityCounts", () => {
  /* Counted from the MERGED list. Counting the inputs would advertise rows the
   * list does not contain, which teaches people to distrust the filter. */
  it("counts what the list actually holds, after dedupe", () => {
    const merged = mergeActivity([swap()], [order()]); // same tx — one row
    expect(activityCounts(merged)).toEqual({ all: 1, swaps: 1, orders: 0 });
  });
});

describe("toSwapRows", () => {
  it("names both tokens and reports the realised rate", () => {
    const [row] = toSwapRows(
      [
        {
          tokenIn: "0xaaa",
          tokenOut: "0xbbb",
          tokenInSymbol: "ETH",
          tokenOutSymbol: "USDC",
          amountIn: 1.5,
          amountOut: 3000,
          timestamp: 1_785_600_000,
          txHash: "0xsweep",
        },
      ],
      NET,
    );
    expect(row!.paySymbol).toBe("ETH");
    expect(row!.receiveSymbol).toBe("USDC");
    expect(row!.rate).toBe("2000");
  });

  /* The gateway LEFT JOINs the token tables, so a token the indexer has not seen
   * resolves to null. A swap that happened must not render as a swap of nothing. */
  it("falls back to a short address when a token is unknown", () => {
    const [row] = toSwapRows(
      [{ tokenIn: "0x1234567890abcdef1234567890abcdef12345678", amountIn: 1, amountOut: 2 }],
      NET,
    );
    expect(row!.paySymbol).toBe("0x1234…5678");
  });
});

describe("swapRate", () => {
  it("is a rate, so it never renders zero for a swap that moved nothing", () => {
    expect(swapRate(0, 100)).toBe("--");
    expect(swapRate(null, 100)).toBe("--");
    expect(swapRate(1, undefined)).toBe("--");
  });
});
