import { describe, expect, it } from "vitest";
import {
  createOrderCloseAggregator,
  describeOrderClose,
  orderCloseKey,
  type OrderCloseInput,
} from "./orderCloseAggregator";

const fmt = (value: number) => value.toFixed(2);

function close(over: Partial<OrderCloseInput> = {}): OrderCloseInput {
  return {
    txHash: "0xsweep",
    pair: "0xbaseusdc",
    status: "filled",
    isBid: false,
    price: 100,
    ...over,
  };
}

describe("createOrderCloseAggregator", () => {
  it("folds every order closed by one transaction into a single aggregate", () => {
    const agg = createOrderCloseAggregator();

    agg.add(close({ price: 100 }));
    agg.add(close({ price: 100.2 }));
    const third = agg.add(close({ price: 100.4 }));

    expect(third.orders).toBe(3);
    expect(third.side).toBe("sell");
    expect(third.minPrice).toBe(100);
    expect(third.maxPrice).toBe(100.4);
    expect(agg.size).toBe(1);
  });

  it("keeps a fill and a cancellation apart even in the same transaction", () => {
    const agg = createOrderCloseAggregator();

    const a = agg.add(close({ status: "filled" }));
    const b = agg.add(close({ status: "canceled" }));

    expect(a.key).not.toBe(b.key);
    expect(b.orders).toBe(1);
    expect(agg.size).toBe(2);
  });

  it("separates transactions", () => {
    const agg = createOrderCloseAggregator();

    agg.add(close({ txHash: "0xone" }));
    const other = agg.add(close({ txHash: "0xtwo" }));

    expect(other.orders).toBe(1);
    expect(agg.size).toBe(2);
  });

  it("reports mixed once both sides appear — a cancel-all can hit both books", () => {
    const agg = createOrderCloseAggregator();

    expect(agg.add(close({ status: "canceled", isBid: true })).side).toBe("buy");
    expect(agg.add(close({ status: "canceled", isBid: false })).side).toBe("mixed");
    // Once mixed, it stays mixed.
    expect(agg.add(close({ status: "canceled", isBid: true })).side).toBe("mixed");
  });

  it("survives a closure whose row was no longer cached, so no price came with it", () => {
    const agg = createOrderCloseAggregator();

    agg.add(close({ price: undefined }));
    const second = agg.add(close({ price: 99.5 }));

    expect(second.orders).toBe(2);
    expect(second.minPrice).toBe(99.5);
    expect(second.maxPrice).toBe(99.5);
  });

  it("leaves the price absent when no closure carried one", () => {
    const agg = createOrderCloseAggregator();
    const only = agg.add(close({ price: undefined }));

    expect(only.minPrice).toBeUndefined();
    expect(only.maxPrice).toBeUndefined();
  });

  it("starts a fresh aggregate past the ttl, rather than restating a read toast", () => {
    let clock = 0;
    const agg = createOrderCloseAggregator({ ttlMs: 1000, now: () => clock });

    agg.add(close());
    clock = 1001;
    const straggler = agg.add(close());

    expect(straggler.orders).toBe(1);
    expect(agg.size).toBe(1);
  });

  it("prunes expired aggregates instead of growing for the session", () => {
    let clock = 0;
    const agg = createOrderCloseAggregator({ ttlMs: 1000, now: () => clock });

    for (let i = 0; i < 50; i++) {
      clock = i * 500;
      agg.add(close({ txHash: `0x${i}` }));
    }

    // At 500 ms apart and a 1 s ttl, only the last few can still be live.
    expect(agg.size).toBeLessThanOrEqual(3);
  });

  it("keeps markets apart inside one transaction, so a range cannot span two quote tokens", () => {
    // `cancelOrders` takes arrays of base/quote/isBid/orderIds, so cancelling
    // across markets is ONE transaction. Keyed on the hash alone these would share
    // an aggregate and report "from 0.0512 to 1635.00" — a range over two
    // different quote tokens, which is the price of nothing.
    const agg = createOrderCloseAggregator();

    const wbtc = agg.add(close({ status: "canceled", pair: "0xwbtcusdc", price: 0.0512 }));
    const eth = agg.add(close({ status: "canceled", pair: "0xethusdc", price: 1635 }));

    expect(wbtc.key).not.toBe(eth.key);
    expect(eth.orders).toBe(1);
    expect(eth.minPrice).toBe(1635);
    expect(eth.maxPrice).toBe(1635);
    expect(agg.size).toBe(2);
  });

  it("keys on transaction, market and status", () => {
    expect(orderCloseKey({ txHash: "0xa", pair: "0xp", status: "filled" })).toBe(
      "0xa:0xp:filled",
    );
    expect(orderCloseKey({ txHash: "0xa", pair: "0xp", status: "canceled" })).toBe(
      "0xa:0xp:canceled",
    );
    expect(orderCloseKey({ txHash: "0xa", pair: "0xq", status: "filled" })).toBe(
      "0xa:0xq:filled",
    );
  });
});

describe("describeOrderClose", () => {
  const agg = createOrderCloseAggregator();

  it("reads exactly as it shipped for a single order", () => {
    const one = createOrderCloseAggregator();
    expect(describeOrderClose(one.add(close({ price: 100 })), fmt)).toEqual({
      title: "Sell order filled at 100.00",
    });

    const two = createOrderCloseAggregator();
    expect(
      describeOrderClose(two.add(close({ status: "canceled", isBid: true })), fmt),
    ).toEqual({ title: "Buy order is cancelled" });
  });

  it("omits the price when the closure carried none", () => {
    const one = createOrderCloseAggregator();
    expect(describeOrderClose(one.add(close({ price: undefined })), fmt).title).toBe(
      "Sell order filled",
    );
  });

  it("counts the orders and gives a price range for a sweep", () => {
    const sweep = createOrderCloseAggregator();
    sweep.add(close({ price: 100 }));
    sweep.add(close({ price: 100.2 }));
    const third = sweep.add(close({ price: 100.4 }));

    expect(describeOrderClose(third, fmt)).toEqual({
      title: "3 sell orders filled",
      description: "from 100.00 to 100.40",
    });
  });

  it("collapses the range to one price when they all closed at the same level", () => {
    const sweep = createOrderCloseAggregator();
    sweep.add(close({ price: 100 }));
    const second = sweep.add(close({ price: 100 }));

    expect(describeOrderClose(second, fmt).description).toBe("at 100.00");
  });

  it("drops the side word rather than picking one when sides are mixed", () => {
    const cancelAll = createOrderCloseAggregator();
    cancelAll.add(close({ status: "canceled", isBid: true }));
    const second = cancelAll.add(close({ status: "canceled", isBid: false }));

    expect(describeOrderClose(second, fmt).title).toBe("2 orders cancelled");
  });

  it("spells the wire value canceled and the copy cancelled", () => {
    const one = createOrderCloseAggregator();
    const single = one.add(close({ status: "canceled" }));

    expect(single.status).toBe("canceled");
    expect(describeOrderClose(single, fmt).title).toContain("cancelled");
  });

  it("never claims a fill for a cancellation", () => {
    const many = createOrderCloseAggregator();
    many.add(close({ status: "canceled" }));
    const second = many.add(close({ status: "canceled" }));

    expect(describeOrderClose(second, fmt).title).toBe("2 sell orders cancelled");
  });

  it("does not average prices — it has no sizes to weight them by", () => {
    const sweep = createOrderCloseAggregator();
    sweep.add(close({ price: 10 }));
    const second = sweep.add(close({ price: 1000 }));

    const { description } = describeOrderClose(second, fmt);
    expect(description).toBe("from 10.00 to 1000.00");
    expect(description).not.toContain("505");
  });

  it("keeps the aggregator reusable", () => {
    agg.reset();
    expect(agg.size).toBe(0);
  });
});
