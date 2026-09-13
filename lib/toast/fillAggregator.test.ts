import { describe, expect, it } from "vitest";
import {
  createFillAggregator,
  describeFill,
  fillKey,
  filledFraction,
  type FillInput,
} from "./fillAggregator";

const fill = (over: Partial<FillInput> = {}): FillInput => ({
  txHash: "0xabc",
  pair: "0xpair",
  side: "sell",
  matched: 1,
  price: 100,
  symbol: "BASE",
  ...over,
});

describe("fillKey", () => {
  it("separates the two sides of the same transaction and market", () => {
    expect(fillKey(fill({ side: "buy" }))).not.toBe(fillKey(fill({ side: "sell" })));
  });

  it("separates markets, so a routed multi-hop swap does not sum across tokens", () => {
    expect(fillKey(fill({ pair: "0xone" }))).not.toBe(fillKey(fill({ pair: "0xtwo" })));
  });
});

describe("createFillAggregator", () => {
  it("collapses a book sweep into one aggregate", () => {
    const agg = createFillAggregator();
    let latest = agg.add(fill({ matched: 2, price: 100 }));
    for (let i = 0; i < 19; i++) latest = agg.add(fill({ matched: 2, price: 100 }));

    // 20 fills on one market order -> one live entry, not twenty toasts.
    expect(agg.size).toBe(1);
    expect(latest.fills).toBe(20);
    expect(latest.size).toBe(40);
  });

  it("weights the average price by size, not by fill count", () => {
    const agg = createFillAggregator();
    agg.add(fill({ matched: 9, price: 100 }));
    const latest = agg.add(fill({ matched: 1, price: 200 }));

    // A naive mean would say 150.
    expect(latest.avgPrice).toBe(110);
  });

  it("reports the latest price rather than zero when every fill rounds to nothing", () => {
    const agg = createFillAggregator();
    const latest = agg.add(fill({ matched: 0, price: 42 }));

    expect(latest.size).toBe(0);
    expect(latest.avgPrice).toBe(42);
  });

  it("keeps separate transactions apart", () => {
    const agg = createFillAggregator();
    agg.add(fill({ txHash: "0xone" }));
    const second = agg.add(fill({ txHash: "0xtwo" }));

    expect(agg.size).toBe(2);
    expect(second.fills).toBe(1);
  });

  it("carries the newest remaining size forward and keeps zero distinct from absent", () => {
    const agg = createFillAggregator();
    agg.add(fill({ matched: 4, placed: 6, orderSize: 10 }));
    const cleared = agg.add(fill({ matched: 6, placed: 0 }));

    expect(cleared.placed).toBe(0);
    // orderSize was only sent on the first fill; it must survive.
    expect(cleared.orderSize).toBe(10);
  });

  it("leaves placed undefined for a taker, who has no resting order", () => {
    const agg = createFillAggregator();
    expect(agg.add(fill()).placed).toBeUndefined();
  });

  it("evicts aggregates once their ttl passes, so a long session cannot grow forever", () => {
    let clock = 0;
    const agg = createFillAggregator({ ttlMs: 1_000, now: () => clock });

    agg.add(fill({ txHash: "0xold" }));
    expect(agg.size).toBe(1);

    clock = 5_000;
    agg.add(fill({ txHash: "0xnew" }));
    expect(agg.size).toBe(1);
  });
});

describe("filledFraction", () => {
  it("measures progress against the whole order, not against this transaction", () => {
    expect(filledFraction({ placed: 6, orderSize: 10 })).toBeCloseTo(0.4);
  });

  it("returns null rather than guessing when the order size is unknown", () => {
    expect(filledFraction({ placed: 6, orderSize: undefined })).toBeNull();
    expect(filledFraction({ placed: undefined, orderSize: 10 })).toBeNull();
  });

  it("returns null on a zero-size order instead of dividing by zero", () => {
    expect(filledFraction({ placed: 0, orderSize: 0 })).toBeNull();
  });

  it("clamps rather than reporting over 100%", () => {
    expect(filledFraction({ placed: 0, orderSize: 10 })).toBe(1);
  });
});

describe("describeFill", () => {
  const agg = createFillAggregator();

  it("names a single fill without inventing an average", () => {
    agg.reset();
    const out = describeFill(agg.add(fill({ matched: 4, price: 100 })));

    expect(out.title).toBe("Sold 4 BASE at 100");
    expect(out.description).toBeUndefined();
  });

  it("reports the fill count and progress once a transaction produces several", () => {
    agg.reset();
    agg.add(fill({ matched: 4, price: 100, placed: 6, orderSize: 10 }));
    const out = describeFill(agg.add(fill({ matched: 2, price: 100, placed: 4, orderSize: 10 })));

    expect(out.title).toBe("Sold 6 BASE at avg 100");
    expect(out.description).toBe("2 fills · 60% filled · 4 BASE still resting");
  });

  it("says the order is complete rather than '0 still resting'", () => {
    agg.reset();
    const out = describeFill(agg.add(fill({ matched: 10, price: 100, placed: 0, orderSize: 10 })));

    expect(out.description).toBe("100% filled · order complete");
  });

  it("uses the caller's number formatting", () => {
    agg.reset();
    const out = describeFill(
      agg.add(fill({ side: "buy", matched: 1.23456789, price: 100.987654 })),
      (value) => value.toFixed(2),
    );

    expect(out.title).toBe("Bought 1.23 BASE at 100.99");
  });
});
