import { describe, expect, it } from "vitest";
import type { OpenOrder } from "./types";
import { openOrderKey } from "./orderIdentity";

const order: OpenOrder = {
  orderId: 4,
  baseAddress: "0x0000000000000000000000000000000000000001",
  quoteAddress: "0x0000000000000000000000000000000000000002",
  market: { base: "ETH", quote: "USDC", network: "RISE Testnet" },
  side: "Buy",
  price: "1980",
  amount: "40 USDC",
  filledPct: 0,
  status: "Open",
};

describe("openOrderKey", () => {
  it("distinguishes bid and ask rows that share an order ID", () => {
    expect(openOrderKey(order)).not.toBe(
      openOrderKey({ ...order, side: "Sell" }),
    );
  });

  it("distinguishes identical pair orders on different chains", () => {
    expect(openOrderKey(order)).not.toBe(
      openOrderKey({
        ...order,
        market: { ...order.market, network: "Base" },
      }),
    );
  });

  it("normalizes address casing", () => {
    expect(openOrderKey(order)).toBe(
      openOrderKey({
        ...order,
        baseAddress: order.baseAddress?.toUpperCase() as `0x${string}`,
      }),
    );
  });
});
