import { describe, expect, it } from "vitest";
import { crownOf, crownPct, sparkPoints, CONTENDER_COUNT } from "./crown";
import type { SpotToken } from "@/types";

const coin = (over: Partial<SpotToken> & { id: string }): SpotToken =>
  ({ symbol: over.id, marketCap: 0, verified: false, graduatedAt: null, ...over }) as SpotToken;

const THRESHOLD = 69_420;

describe("crownOf", () => {
  const field = [
    coin({ id: "A", marketCap: 12_000 }),
    coin({ id: "B", marketCap: 40_000 }),
    coin({ id: "C", marketCap: 3_000 }),
  ];

  it("crowns the launch closest to the threshold", () => {
    const { king, contenders } = crownOf(field, THRESHOLD);
    expect(king?.id).toBe("B");
    expect(contenders.map((t) => t.id)).toEqual(["A", "C"]);
  });

  /* A race with no finish line is not a race. Ranking by cap and calling the
     leader a king would invent a target this venue does not have. */
  it("has no king when the operator has set no threshold", () => {
    expect(crownOf(field, undefined).king).toBeNull();
    expect(crownOf(field, 0).king).toBeNull();
  });

  it("still fills the market-cap strip without a threshold", () => {
    expect(crownOf(field, undefined).top.map((t) => t.id)).toEqual(["B", "A", "C"]);
  });

  /* A graduated coin has already won and left — otherwise it holds the crown
     for ever and the launches this section exists for never appear. */
  it("excludes anything already listed, by either signal", () => {
    const withWinners = [
      ...field,
      coin({ id: "LISTED", marketCap: 60_000, verified: true }),
      coin({ id: "LATCHED", marketCap: 55_000, graduatedAt: 1 }),
    ];
    const { king, contenders } = crownOf(withWinners, THRESHOLD);
    expect(king?.id).toBe("B");
    expect(contenders.map((t) => t.id)).not.toContain("LISTED");
    expect(contenders.map((t) => t.id)).not.toContain("LATCHED");
  });

  it("excludes a coin already past the threshold even if nothing latched it", () => {
    const over = [...field, coin({ id: "OVER", marketCap: THRESHOLD + 1 })];
    expect(crownOf(over, THRESHOLD).king?.id).toBe("B");
  });

  it("ignores an unpriced coin rather than crowning a zero", () => {
    expect(crownOf([coin({ id: "Z" })], THRESHOLD).king).toBeNull();
  });

  it("caps the contender list", () => {
    const many = Array.from({ length: 12 }, (_, i) => coin({ id: `T${i}`, marketCap: 1000 - i }));
    expect(crownOf(many, THRESHOLD).contenders).toHaveLength(CONTENDER_COUNT);
  });
});

describe("crownPct", () => {
  it("measures against the operator's threshold and clamps", () => {
    expect(crownPct(coin({ id: "A", marketCap: 34_710 }), THRESHOLD)).toBeCloseTo(50, 5);
    expect(crownPct(coin({ id: "A", marketCap: THRESHOLD * 3 }), THRESHOLD)).toBe(100);
  });

  it("is null with no threshold or no cap — never 0", () => {
    expect(crownPct(coin({ id: "A", marketCap: 10 }), undefined)).toBeNull();
    expect(crownPct(coin({ id: "A" }), THRESHOLD)).toBeNull();
  });
});

describe("sparkPoints", () => {
  /* The venue ships `sparkline7D: [1]` on a coin launched today. Drawn as a
     line that is a flat week — a claim about time that has not passed. */
  it("refuses a single point", () => {
    expect(sparkPoints(coin({ id: "A", sparkline7D: [1] } as never))).toBeNull();
  });

  it("refuses a run of identical points", () => {
    expect(sparkPoints(coin({ id: "A", sparkline7D: [1, 1, 1] } as never))).toBeNull();
  });

  it("accepts a real series", () => {
    expect(sparkPoints(coin({ id: "A", sparkline7D: [1, 1.4, 1.2] } as never))).toEqual([1, 1.4, 1.2]);
  });

  it("survives a missing or malformed column", () => {
    expect(sparkPoints(coin({ id: "A" }))).toBeNull();
    expect(sparkPoints(coin({ id: "A", sparkline7D: "nope" } as never))).toBeNull();
  });
});
