import { describe, expect, it } from "vitest";
import { compactAmount, mergeEvents, shortActor, tickerKey, type TickerEvent } from "./ticker";

const trade = (id: string, timestamp: number): TickerEvent => ({
  id,
  kind: "sold",
  actor: "0x7938aC1e2b3d4F5a6B7c8D9e0F1a2B3c4D5e6F70",
  amount: 5_340,
  symbol: "NOVA",
  timestamp,
});

describe("tickerKey", () => {
  /**
   * The dedupe identity. A reconnect replays the room's recent buffer, so the same fill
   * arrives twice; two different fills can also share a second. Keying on the transaction
   * and order handles both, keying on the timestamp handles neither.
   */
  it("identifies a trade by transaction and order, not by time", () => {
    const a = tickerKey({ kind: "sold", txHash: "0xabc", orderId: 7 });
    const b = tickerKey({ kind: "sold", txHash: "0xabc", orderId: 7 });
    const c = tickerKey({ kind: "sold", txHash: "0xabc", orderId: 8 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("identifies a creation by its token address", () => {
    expect(tickerKey({ kind: "created", address: "0xNOVA" })).toBe("created:0xNOVA");
  });

  it("cannot collide across kinds", () => {
    expect(tickerKey({ kind: "created", address: "0xabc" })).not.toBe(
      tickerKey({ kind: "sold", txHash: "0xabc" }),
    );
  });
});

describe("mergeEvents", () => {
  it("puts the newest first", () => {
    const merged = mergeEvents([trade("a", 100)], [trade("b", 200)]);
    expect(merged.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("drops a re-delivered event rather than showing it twice", () => {
    const merged = mergeEvents([trade("a", 100)], [trade("a", 100)]);
    expect(merged).toHaveLength(1);
  });

  /**
   * The cap is load-bearing: the marquee renders its list TWICE for a seamless loop, so an
   * unbounded feed grows the track without limit on a busy chain.
   */
  it("caps the feed", () => {
    const many = Array.from({ length: 50 }, (_, i) => trade(`t${i}`, i));
    const merged = mergeEvents([], many, 24);
    expect(merged).toHaveLength(24);
    // and keeps the newest, not the first 24 delivered
    expect(merged[0].timestamp).toBe(49);
  });

  it("keeps the existing feed when nothing new arrives", () => {
    const existing = [trade("a", 100), trade("b", 90)];
    expect(mergeEvents(existing, [])).toEqual(existing);
  });
});

describe("formatting", () => {
  it("shortens an actor to four hex digits, like the reference tape", () => {
    expect(shortActor("0x7938aC1e2b3d4F5a6B7c8D9e0F1a2B3c4D5e6F70")).toBe("0x7938");
  });

  it("does not mangle something that is already short", () => {
    expect(shortActor("")).toBe("someone");
    expect(shortActor("0x12")).toBe("0x12");
  });

  it("compacts amounts so a pill stays one line", () => {
    expect(compactAmount(5_340)).toBe("5.34K");
    expect(compactAmount(14.6)).toBe("14.60");
    expect(compactAmount(1_890)).toBe("1.89K");
    expect(compactAmount(2_400_000)).toBe("2.40M");
  });

  it("renders nothing for an absent amount — a creation has none", () => {
    expect(compactAmount(undefined)).toBe("");
    expect(compactAmount(Number.NaN)).toBe("");
  });
});
