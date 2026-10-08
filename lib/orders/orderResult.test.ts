import { describe, it, expect } from "vitest";
import { encodeEventTopics, encodeAbiParameters, erc20Abi, type Abi, type AbiEvent } from "viem";
import { MatchingEngineABI } from "@iter/abis";
import { decodeOrderResult, describeOrderResult, type ReceiptLog } from "./orderResult";
import {
  MARKET_BUY_RESTED,
  MARKET_BUY_RESTED_FROM,
  HALTED_THEN_RESTED,
  HALTED_THEN_RESTED_FROM,
} from "./orderResult.fixtures";

// RISE: MatchingEngine, and the KPRF1448/tUSD market the fixtures traded on.
const ENGINE = "0x2bDe7Aa08273820056C47Dc8312da25Fcc62326A" as const;
const BASE = "0xa875DFC2702635Cc1630Ec9EC36E789d34C48E5E" as const; // KPRF1448, 18 dp
const QUOTE = "0x598b7315989EA43a7C218c536ef82C98E5b73A89" as const; // tUSD, 6 dp
const PAIR = "0x43306645994a7a88bcf6ec15c5a3d960f8b4d5ea" as const;
const ME = "0x00000000000000000000000000000000000000aa" as const;
const MAKER = "0x00000000000000000000000000000000000000bb" as const;
const LADDER = "0x00000000000000000000000000000000000000cc" as const;

const base = { symbol: "KPRF1448", decimals: 18 };
const quote = { symbol: "tUSD", decimals: 6 };

const abi = MatchingEngineABI as unknown as Abi;
const ev = (name: string) =>
  abi.find((x) => x.type === "event" && x.name === name) as AbiEvent;

function engineLog(name: string, args: Record<string, unknown>): ReceiptLog {
  const event = ev(name);
  const topics = encodeEventTopics({ abi: [event], eventName: name, args } as never);
  const nonIndexed = event.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(nonIndexed, nonIndexed.map((i) => args[i.name!]) as never);
  return { address: ENGINE, topics: topics as string[], data };
}

function transfer(token: string, from: string, to: string, value: bigint): ReceiptLog {
  const topics = encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } as never });
  return {
    address: token,
    topics: topics as string[],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  };
}

function matched(opts: {
  sender: string;
  price: bigint;
  baseAmount: bigint;
  quoteAmount: bigint;
  isBid?: boolean;
  baseFee?: bigint;
  quoteFee?: bigint;
}): ReceiptLog {
  return engineLog("OrderMatched", {
    pair: PAIR,
    orderHistoryId: 1,
    id: BigInt(7),
    isBid: opts.isBid ?? true,
    price: opts.price,
    total: BigInt(0),
    clear: true,
    orderMatch: {
      sender: opts.sender,
      owner: MAKER,
      baseAmount: opts.baseAmount,
      quoteAmount: opts.quoteAmount,
      baseFee: opts.baseFee ?? BigInt(0),
      quoteFee: opts.quoteFee ?? BigInt(0),
      tradeId: BigInt(1),
    },
  });
}

const placed = (owner: string, price: bigint, amount: bigint, isBid = true) =>
  engineLog("OrderPlaced", {
    pair: PAIR, orderHistoryId: 2, id: BigInt(9), owner, isBid, price, withoutFee: amount, placed: amount,
  });

const E18 = BigInt(10) ** BigInt(18);
const tusd = (n: number) => BigInt(Math.round(n * 1e6));

describe("decodeOrderResult — real RISE receipts", () => {
  it("market buy that RESTED (isMaker: true era): no fill, a bid at 0.000005", () => {
    const r = decodeOrderResult({
      logs: MARKET_BUY_RESTED, engine: ENGINE, account: MARKET_BUY_RESTED_FROM, spendToken: QUOTE, isBid: true,
    });
    expect(r.readable).toBe(true);
    expect(r.fills).toBe(0);
    expect(r.rested).toEqual({ placed: BigInt(300_000_000), price1e8: BigInt(500) });
    expect(r.refunded).toBe(BigInt(0));
    const copy = describeOrderResult(r, { kind: "market", isBid: true, base, quote });
    expect(copy.tone).toBe("warning");
    expect(copy.title).toBe("Market order not filled — resting at 0.000005");
    expect(copy.description).toContain("300 tUSD resting at 0.000005");
  });

  it("order sent under the reserve: MatchingHaltedForGas, matched=0, then rested", () => {
    const r = decodeOrderResult({
      logs: HALTED_THEN_RESTED, engine: ENGINE, account: HALTED_THEN_RESTED_FROM, spendToken: BASE, isBid: false,
    });
    expect(r.haltedForGas).toBe(true);
    expect(r.fills).toBe(0);
    expect(r.rested?.placed).toBe(BigInt(10_000_000) * E18);
    const copy = describeOrderResult(r, { kind: "limit", isBid: false, base, quote });
    expect(copy.tone).toBe("warning");
    expect(copy.title).toContain("stopped early (gas)");
    expect(copy.title).toContain("not filled");
  });

  it("filters to the account: someone else's receipt says nothing about mine", () => {
    const r = decodeOrderResult({
      logs: MARKET_BUY_RESTED, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true,
    });
    expect(r.rested).toBeUndefined();
    expect(r.fills).toBe(0);
  });
});

describe("decodeOrderResult — synthesized outcomes", () => {
  it("full fill across two levels: size-weighted average price", () => {
    const logs = [
      transfer(QUOTE, ME, ENGINE, tusd(30)),
      matched({ sender: ME, price: BigInt(1000), baseAmount: BigInt(1_000_000) * E18, quoteAmount: tusd(10) }),
      matched({ sender: ME, price: BigInt(2000), baseAmount: BigInt(1_000_000) * E18, quoteAmount: tusd(20) }),
    ];
    const r = decodeOrderResult({ logs, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    expect(r.fills).toBe(2);
    expect(r.bookBase).toBe(BigInt(2_000_000) * E18);
    expect(r.avgPrice1e8).toBe(BigInt(1500));
    const copy = describeOrderResult(r, { kind: "market", isBid: true, base, quote });
    expect(copy.tone).toBe("success");
    expect(copy.title).toBe("Market order filled");
    expect(copy.description).toBe("Bought 2,000,000 KPRF1448 at avg 0.000015 tUSD.");
  });

  it("partial fill, rest refunded (taker market order): warning naming both", () => {
    const logs = [
      matched({ sender: ME, price: BigInt(500), baseAmount: BigInt(2_000_000) * E18, quoteAmount: tusd(10) }),
      transfer(QUOTE, ENGINE, ME, tusd(290)),
    ];
    const r = decodeOrderResult({ logs, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    expect(r.refunded).toBe(tusd(290));
    const copy = describeOrderResult(r, { kind: "market", isBid: true, base, quote });
    expect(copy.tone).toBe("warning");
    expect(copy.title).toBe("Market order partly filled");
    expect(copy.description).toContain("290 tUSD refunded");
  });

  it("partial fill, rest resting (limit): information, not a warning", () => {
    const logs = [
      matched({ sender: ME, price: BigInt(500), baseAmount: BigInt(2_000_000) * E18, quoteAmount: tusd(10) }),
      placed(ME, BigInt(500), tusd(5)),
    ];
    const r = decodeOrderResult({ logs, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    const copy = describeOrderResult(r, { kind: "limit", isBid: true, base, quote });
    expect(copy.tone).toBe("info");
    expect(copy.description).toContain("5 tUSD resting at 0.000005");
  });

  it("nothing fills, everything refunded: market order warning", () => {
    const logs = [transfer(QUOTE, ME, ENGINE, tusd(1)), transfer(QUOTE, ENGINE, ME, tusd(1))];
    const r = decodeOrderResult({ logs, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    expect(r.refunded).toBe(tusd(1));
    const copy = describeOrderResult(r, { kind: "market", isBid: true, base, quote });
    expect(copy.tone).toBe("warning");
    expect(copy.title).toBe("Market order not filled — refunded");
  });

  it("the pool took the whole remainder: filled via the pool", () => {
    const logs = [
      engineLog("RemainderRoutedToPool", { pair: PAIR, recipient: ME, spent: tusd(5), received: BigInt(900_000) * E18 }),
    ];
    const r = decodeOrderResult({ logs, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    const copy = describeOrderResult(r, { kind: "market", isBid: true, base, quote });
    expect(copy.tone).toBe("success");
    expect(copy.title).toBe("Market order filled via the pool");
    expect(copy.description).toContain("900,000 KPRF1448 via the pool");
  });

  it("ladder route: LadderBuyer is the engine's taker and the refunder", () => {
    const logs = [
      matched({ sender: LADDER, price: BigInt(500), baseAmount: BigInt(1_000_000) * E18, quoteAmount: tusd(5) }),
      transfer(QUOTE, ENGINE, LADDER, tusd(1)), // engine -> router is NOT the user's refund
      transfer(QUOTE, LADDER, ME, tusd(1)),
    ];
    const r = decodeOrderResult({ logs, engine: ENGINE, via: LADDER, account: ME, spendToken: QUOTE, isBid: true });
    expect(r.fills).toBe(1);
    expect(r.refunded).toBe(tusd(1));
  });

  it("no log from the engine: unknown, never 'not filled'", () => {
    const logs = [transfer(QUOTE, ME, "0x00000000000000000000000000000000000000dd", tusd(1))];
    const r = decodeOrderResult({ logs, engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    expect(r.readable).toBe(false);
    const copy = describeOrderResult(r, { kind: "market", isBid: true, base, quote });
    expect(copy.tone).toBe("info");
    expect(copy.title).toBe("Market order confirmed");
  });

  it("a buy reports base net of the taker fee; a sell reports quote net of it", () => {
    const buy = decodeOrderResult({
      logs: [matched({ sender: ME, price: BigInt(500), baseAmount: BigInt(200_000) * E18, quoteAmount: tusd(1), baseFee: BigInt(200) * E18 })],
      engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true,
    });
    expect(describeOrderResult(buy, { kind: "market", isBid: true, base, quote }).description).toBe(
      "Bought 199,800 KPRF1448 at avg 0.000005 tUSD.",
    );
    const sell = decodeOrderResult({
      logs: [matched({ sender: ME, isBid: false, price: BigInt(500), baseAmount: BigInt(200_000) * E18, quoteAmount: tusd(1), quoteFee: tusd(0.001) })],
      engine: ENGINE, account: ME, spendToken: BASE, isBid: false,
    });
    expect(describeOrderResult(sell, { kind: "market", isBid: false, base, quote }).description).toBe(
      "Sold 200,000 KPRF1448 at avg 0.000005 tUSD for 0.999 tUSD.",
    );
  });

  it("ignores undecodable engine logs instead of throwing", () => {
    const junk: ReceiptLog = { address: ENGINE, topics: ["0x" + "11".repeat(32)], data: "0x" };
    const r = decodeOrderResult({ logs: [junk], engine: ENGINE, account: ME, spendToken: QUOTE, isBid: true });
    expect(r.readable).toBe(true);
    expect(r.fills).toBe(0);
  });
});
