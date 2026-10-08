import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import { exchangeAbi } from "@/components/abis/exchange";
import {
  avgFillPrice,
  buildCancelArgs,
  fillFee,
  fillFeeLabel,
  fillSplitLabel,
  formatAmount,
  historyFills,
  neverRested,
  historySize,
  historyStatus,
  isFinished,
  sortHoldingsFirst,
  toFillDetailViews,
  txUrl,
  addressUrl,
} from "./orderRows";

const BASE = "0xa875DFC2702635Cc1630Ec9EC36E789d34C48E5E";
const QUOTE = "0x598b7315989EA43a7C218c536ef82C98E5b73A89";

describe("buildCancelArgs", () => {
  it("builds ONE tuple list that viem encodes for cancelOrders", () => {
    const args = buildCancelArgs([
      { base: BASE, quote: QUOTE, isBid: true, orderId: 7 },
      { base: BASE, quote: QUOTE, isBid: false, orderId: "12" },
    ]);
    expect(args).toEqual([
      { base: BASE, quote: QUOTE, isBid: true, orderId: 7 },
      { base: BASE, quote: QUOTE, isBid: false, orderId: 12 },
    ]);
    // The exact call that threw AbiEncodingLengthMismatchError with four arrays.
    const data = encodeFunctionData({ abi: exchangeAbi, functionName: "cancelOrders", args: [args] });
    const decoded = decodeFunctionData({ abi: exchangeAbi, data });
    expect(decoded.functionName).toBe("cancelOrders");
    const [list] = decoded.args as unknown as [Array<{ base: string; quote: string; isBid: boolean; orderId: number }>];
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ base: BASE, quote: QUOTE, isBid: true, orderId: 7 });
    expect(list[1]).toMatchObject({ isBid: false, orderId: 12 });
  });

  it("the old four-array shape is what viem refuses", () => {
    expect(() =>
      encodeFunctionData({
        abi: exchangeAbi,
        functionName: "cancelOrders",
        // the shape the table used to send
        args: [[BASE], [QUOTE], [true], [BigInt(7)]] as never,
      }),
    ).toThrow();
  });

  it("refuses rows it cannot cancel instead of sending them", () => {
    expect(() => buildCancelArgs([{ base: BASE, quote: QUOTE, isBid: true, orderId: null }])).toThrow(/no id/);
    // Engine ids start at 1, so 0 is never a real order, whoever sent it.
    expect(() => buildCancelArgs([{ base: BASE, quote: QUOTE, isBid: true, orderId: 0 }])).toThrow();
    expect(() => buildCancelArgs([{ base: BASE, quote: QUOTE, isBid: true, orderId: "0" }])).toThrow();
    expect(() => buildCancelArgs([{ base: "nope", quote: QUOTE, isBid: true, orderId: 1 }])).toThrow(/address/);
    expect(() => buildCancelArgs([{ base: BASE, quote: QUOTE, isBid: true, orderId: 2 ** 32 }])).toThrow(/uint32/);
    expect(() => buildCancelArgs([{ base: BASE, quote: QUOTE, isBid: true, orderId: 1.5 }])).toThrow(/uint32/);
  });

  it("accepts a bigint id", () => {
    expect(buildCancelArgs([{ base: BASE, quote: QUOTE, isBid: false, orderId: BigInt(3) }])[0].orderId).toBe(3);
  });
});

describe("historyStatus", () => {
  it("maps the broker's statuses", () => {
    expect(historyStatus({ status: "filled" })).toEqual({ kind: "filled", label: "Filled" });
    expect(historyStatus({ status: "canceled" })).toEqual({ kind: "cancelled", label: "Cancelled" });
    expect(historyStatus({ status: "canceled", matchHistories: [{}] })).toEqual({ kind: "partial", label: "Partly filled" });
    expect(historyStatus({ status: "expired" }).kind).toBe("expired");
    expect(historyStatus({ status: "open" }).kind).toBe("open");
  });

  it("never claims a fill for an unknown status", () => {
    const s = historyStatus({ status: "weird" });
    expect(s.kind).toBe("unknown");
    expect(s.label).not.toMatch(/fill/i);
    expect(historyStatus({}).kind).toBe("unknown");
  });

  it("History holds finished orders only", () => {
    expect(isFinished({ status: "open" })).toBe(false);
    expect(isFinished({ status: "open", matchHistories: [{}] })).toBe(false);
    expect(isFinished({ status: "filled" })).toBe(true);
    expect(isFinished({ status: "canceled" })).toBe(true);
  });
});

describe("historySize", () => {
  it("reads amountBN when a full cancel zeroed the float", () => {
    expect(historySize({ amount: 0, amountBN: "200000000", assetDecimals: 6 })).toBe(200);
  });
  it("falls back to the float", () => {
    expect(historySize({ amount: 2.5 })).toBe(2.5);
    expect(historySize({ amount: 2.5, amountBN: null, assetDecimals: 6 })).toBe(2.5);
  });
});

describe("avgFillPrice", () => {
  it("is size-weighted", () => {
    expect(avgFillPrice([
      { baseAmount: 100, quoteAmount: 1 },
      { baseAmount: 300, quoteAmount: 9 },
    ])).toBeCloseTo(10 / 400);
  });
  it("is null with nothing to weight", () => {
    expect(avgFillPrice([])).toBeNull();
    expect(avgFillPrice(undefined)).toBeNull();
    expect(avgFillPrice([{ baseAmount: 0, quoteAmount: 1 }])).toBeNull();
  });
});

describe("formatAmount", () => {
  it("groups and never rounds a small amount to zero", () => {
    expect(formatAmount(15_000_000)).toBe("15,000,000");
    expect(formatAmount(1234.5678)).toBe("1,234.57");
    expect(formatAmount(2.5)).toBe("2.5");
    expect(formatAmount(0.000005)).toBe("0.000005");
    expect(formatAmount(0)).toBe("0");
    expect(formatAmount("x")).toBe("—");
  });
});

describe("fillFee", () => {
  const row = { isBid: true, taker: "0xAbC", baseFee: 1_600_000, quoteFee: 0, baseSymbol: "KPRF", quoteSymbol: "tUSD" };
  it("shows the taker's recorded fee on the received leg", () => {
    expect(fillFee(row, "0xabc")).toBe("1,600,000 KPRF");
    expect(fillFee({ ...row, isBid: false, baseFee: 0, quoteFee: 0.5 }, "0xabc")).toBe("0.5 tUSD");
  });
  it("a maker pays nothing, and says so", () => {
    expect(fillFee(row, "0xdef")).toBe("0");
  });
});

describe("fillFeeLabel", () => {
  // RISE tx 0xcc3d…4397: 2 tUSD bought 399,600 KPRF from the pool, which kept 400.
  const pool = {
    isBid: true,
    taker: "0xAbC",
    baseFee: null,
    quoteFee: null,
    poolFee: 400,
    poolFeeEstimated: false,
    baseSymbol: "KPRF",
    quoteSymbol: "tUSD",
  };

  it("a pool fill shows the pool's fee in the token received, not 0", () => {
    expect(fillFeeLabel(pool, "0xabc")).toEqual({
      text: "400 KPRF",
      estimated: false,
      title: "Pool fee, taken out of what you received",
    });
    expect(fillFeeLabel({ ...pool, isBid: false, poolFee: 0.4 }, "0xabc").text).toBe("0.4 tUSD");
  });

  it("an estimated pool fee is marked ≈ and explains itself", () => {
    const got = fillFeeLabel({ ...pool, poolFeeEstimated: true }, "0xabc");
    expect(got.text).toBe("≈ 400 KPRF");
    expect(got.estimated).toBe(true);
    expect(got.title).toMatch(/^Estimated pool fee/);
  });

  it("the maker rule comes first: a maker pays 0 even against a pool row", () => {
    expect(fillFeeLabel(pool, "0xdef")).toMatchObject({ text: "0", estimated: false, title: "Makers pay no fee" });
  });

  it("a pool row with no derivable fee falls back to the recorded taker fee, never a guess", () => {
    expect(fillFeeLabel({ ...pool, poolFee: null, poolFeeEstimated: null }, "0xabc").text).toBe("0");
    expect(fillFeeLabel({ ...pool, poolFee: null, baseFee: 2 }, "0xabc").text).toBe("2 KPRF");
  });

  it("a live frame's exact pool fee rides baseFee and reads as a fee", () => {
    expect(fillFeeLabel({ ...pool, poolFee: undefined, baseFee: 400 }, "0xabc").text).toBe("400 KPRF");
  });
});

describe("sortHoldingsFirst", () => {
  it("puts non-zero holdings first by value, the rest in arrival order", () => {
    const out = sortHoldingsFirst([
      { s: "A", balance: 0, valueUSD: 0 },
      { s: "B", balance: 5, valueUSD: 5 },
      { s: "C", balance: 0, valueUSD: 0 },
      { s: "D", balance: 1, valueUSD: 50 },
    ]);
    expect(out.map((t) => t.s)).toEqual(["D", "B", "A", "C"]);
  });
});

describe("txUrl", () => {
  it("is null without a real hash", () => {
    expect(txUrl("RISE Testnet", null)).toBeNull();
    expect(txUrl("RISE Testnet", "0x12")).toBeNull();
  });
});

describe("addressUrl", () => {
  it("links a wallet on the chain's explorer", () => {
    expect(addressUrl("RISE Testnet", "0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99")).toMatch(
      /^https:\/\/[^/]+\/address\/0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99$/,
    );
  });

  it("is null without a real address or a known explorer", () => {
    expect(addressUrl("RISE Testnet", "0x12")).toBeNull();
    expect(addressUrl("Nowhere", "0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99")).toBeNull();
  });
});

describe("who filled it: the pool or another trader", () => {
  it("summarises the split on the collapsed row", () => {
    expect(fillSplitLabel(3, 1)).toBe("3 fills · 1 via pool");
    expect(fillSplitLabel(2, 0)).toBe("2 fills");
    expect(fillSplitLabel(1, 0)).toBe("1 fill");
    expect(fillSplitLabel(1, 1)).toBe("1 fill · via pool");
    expect(fillSplitLabel(4, 4)).toBe("4 fills · all via pool");
    expect(fillSplitLabel(0, 0)).toBeNull();
  });
});

describe("neverRested", () => {
  it("believes `rested` when the gateway sends it, whatever orderId says", () => {
    expect(neverRested({ rested: false, orderId: null })).toBe(true);
    expect(neverRested({ rested: true, orderId: 7 })).toBe(false);
    // `rested` is the answer; a contradicting id does not override it.
    expect(neverRested({ rested: false, orderId: 7 })).toBe(true);
  });

  /* What production sends until the gateway deploys: no `rested`, and a crossed
   * row's orderId null. b362d254's 0 was pushed but never deployed; read it too. */
  it("falls back to orderId only when `rested` is absent", () => {
    for (const orderId of [null, undefined, "", 0, "0"]) {
      expect(neverRested({ orderId }), String(orderId)).toBe(true);
    }
    expect(neverRested({ orderId: 1 })).toBe(false);
    expect(neverRested({ orderId: "12" })).toBe(false);
    expect(neverRested({ orderId: BigInt(7) })).toBe(false);
  });

  it("a crossed row reads lazily in every shape a gateway has sent it", () => {
    const shapes = [
      { rested: false, orderId: null }, // current
      { orderId: null }, // deployed today
      { orderId: 0 }, // b362d254, never deployed
    ];
    for (const shape of shapes) {
      const out = historyFills({ ...shape, txHash: "0xabc", pair: "0xdef", fills: 1, origins: { pool: 1, maker: 0 } });
      expect(out.source, JSON.stringify(shape)).toEqual({ kind: "lazy", txHash: "0xabc", pair: "0xdef" });
      expect(out.split).toMatch(/via pool/);
    }
  });

  it("a rested row with `rested: true` reads its matchHistories", () => {
    const out = historyFills({ rested: true, orderId: 7, matchHistories: [] });
    expect(out.source).toBeNull();
    expect(out.fillCount).toBe(0);
  });
});

describe("historyFills", () => {
  const TX = `0x${"ab".repeat(32)}`;
  const PAIR = "0xF531744dD326081DCADEeB512cDc7e7751240a8E";

  it("a crossed order counts from `fills`/`origins` and loads its fills on demand", () => {
    const out = historyFills({ orderId: null, txHash: TX, pair: PAIR, fills: 3, origins: { pool: 1, maker: 2 } });
    expect(out.fillCount).toBe(3);
    expect(out.viaPool).toBe(1);
    expect(out.split).toBe("3 fills · 1 via pool");
    expect(out.source).toEqual({ kind: "lazy", txHash: TX, pair: PAIR });
  });

  it("a crossed order from a gateway without counts still says how many fills", () => {
    const out = historyFills({ orderId: undefined, txHash: TX, pair: PAIR, fills: 2 });
    expect(out.viaPool).toBeNull();
    expect(out.split).toBe("2 fills");
  });

  it("a rested order lists its matchHistories inline, each with its counterparty", () => {
    const ME = "0x1111111111111111111111111111111111111111";
    const T1 = "0x2222222222222222222222222222222222222222";
    const T2 = "0x3333333333333333333333333333333333333333";
    const out = historyFills({
      orderId: 7,
      account: ME,
      txHash: TX,
      pair: PAIR,
      matchHistories: [
        { tradeId: "1", txHash: TX, timestamp: 1_790_000_000, price: 0.5, baseAmount: 10, baseSymbol: "KPRF", origin: "maker", taker: T1, maker: ME },
        { tradeId: "2", txHash: TX, timestamp: 1_790_000_060, price: 0.51, baseAmount: 1500, baseSymbol: "KPRF", taker: T2, maker: ME },
      ],
    });
    expect(out.fillCount).toBe(2);
    expect(out.viaPool).toBe(0);
    expect(out.split).toBe("2 fills");
    expect(out.source?.kind).toBe("inline");
    const rows = out.source?.kind === "inline" ? out.source.rows : [];
    // The order RESTED, so its owner made each fill: the counterparty is each
    // fill's taker, never the owner's own address.
    expect(rows.map((r) => r.counterparty.traders)).toEqual([[T1], [T2]]);
    expect(rows[1]!.amount).toBe("1,500 KPRF");
    expect(rows[0]!.price).toBe("0.5");
  });

  it("an order that never filled has nothing to expand", () => {
    expect(historyFills({ orderId: 7, matchHistories: [] })).toMatchObject({ split: null, source: null });
    expect(historyFills({ orderId: null, fills: 0 })).toMatchObject({ split: null, source: null });
  });
});

describe("toFillDetailViews", () => {
  it("reads each fill's fee from the viewer's side", () => {
    const fill = { tradeId: "1", isBid: true, taker: "0xT", baseFee: 2, baseSymbol: "KPRF" };
    expect(toFillDetailViews([fill], "0xt")[0]!.fee.text).toBe("2 KPRF");
    // A rested order's fills are ones its owner MADE: no fee.
    expect(toFillDetailViews([fill], "0xmaker")[0]!.fee.text).toBe("0");
  });

  it("labels pool fills as Pool", () => {
    const [v] = toFillDetailViews([
      { tradeId: "9", price: 500, baseAmount: 59_400_000, baseSymbol: "KPRF", origin: "pool", isBid: true, poolFee: 400 },
    ]);
    expect(v!.fee.text).toBe("400 KPRF");
    expect(v!.counterparty.kind).toBe("pool");
    expect(v!.amount).toBe("59,400,000 KPRF");
  });
});

describe("Type: Pool, Maker or Taker", () => {
  it("names each fill by how it executed, from the viewer's side", async () => {
    const { fillType } = await import("./orderRows");
    expect(fillType({ origin: "pool", taker: "0xme" }, "0xme", false)).toBe("Pool");
    expect(fillType({ origin: "book", taker: "0xME", maker: "0xother" }, "0xme", true)).toBe("Taker");
    expect(fillType({ origin: "book", taker: "0xother", maker: "0xMe" }, "0xme", false)).toBe("Maker");
    // No addresses: a rested order's fills were made, a crossed order's taken.
    expect(fillType({}, null, true)).toBe("Maker");
    expect(fillType({}, null, false)).toBe("Taker");
  });

  it("names an order Maker if it rested, Pool if only the pool filled it, else Taker", async () => {
    const { orderType } = await import("./orderRows");
    expect(orderType({ rested: true, orderId: 7 }, 2, 0)).toBe("Maker");
    expect(orderType({ rested: false, orderId: 0 }, 2, 2)).toBe("Pool");
    expect(orderType({ rested: false, orderId: 0 }, 2, 1)).toBe("Taker");
    expect(orderType({ rested: false, orderId: 0 }, 0, 0)).toBe("Taker");
  });

  it("gives each fill its own transaction link when the chain is known", async () => {
    const { toFillDetailViews } = await import("./orderRows");
    const [v] = toFillDetailViews(
      [{ txHash: `0x${"ab".repeat(32)}`, origin: "pool", taker: "0xme", baseAmount: 1, price: 1, baseSymbol: "K" }],
      "0xme",
      { rested: false, networkName: "RISE Testnet" },
    );
    expect(v!.type).toBe("Pool");
    expect(v!.tx).toMatch(/\/tx\/0xabab/);
  });
});
