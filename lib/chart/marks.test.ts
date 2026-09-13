import { describe, expect, it } from "vitest";
import { FAN_LIMIT, clusterMarks, placeCard, type ThesisMark } from "./marks";

/** Bar times ascending, `count` of them `step` apart from `start`. */
function bars(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function mark(over: Partial<ThesisMark> & { id: number; time: number }): ThesisMark {
  return {
    author: `0x${String(over.id).padStart(40, "0")}`,
    name: `trader${over.id}`,
    body: "called it",
    valueUsd: 100,
    plotPrice: 1,
    avatarUrl: null,
    ...over,
  };
}

describe("clusterMarks", () => {
  it("groups by candle, not by exact timestamp", () => {
    // Two inside one 15-minute bar, one in the next.
    const base = 1_757_000_000;
    const bar = bars(base, 900, 3);
    const clusters = clusterMarks(
      [
        mark({ id: 1, time: base + 5 }),
        mark({ id: 2, time: base + 890 }),
        mark({ id: 3, time: base + 901 }),
      ],
      bar,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.marks.map((m) => m.id).sort()).toEqual([1, 2]);
    expect(clusters[1]!.marks.map((m) => m.id)).toEqual([3]);
  });

  it("places a cluster at a time the chart's scale actually has", () => {
    // The whole reason clustering reads the bars: `timeToCoordinate` answers
    // null for a time that is not on the scale, so a computed bucket boundary
    // one second off the server's drops the mark silently.
    const bar = bars(86_400_000, 86_400, 4);
    const [cluster] = clusterMarks([mark({ id: 1, time: bar[1]! + 4_000 })], bar);
    expect(bar).toContain(cluster!.time);
    expect(cluster!.time).toBe(bar[1]);
  });

  it("handles calendar-aligned bars, which no fixed width reproduces", () => {
    // Real month starts: Jan/Feb/Mar 2026 UTC. 28-31 days apart, never 2592000.
    const months = [
      Date.UTC(2026, 0, 1) / 1000,
      Date.UTC(2026, 1, 1) / 1000,
      Date.UTC(2026, 2, 1) / 1000,
    ];
    const clusters = clusterMarks(
      [
        mark({ id: 1, time: Date.UTC(2026, 1, 14) / 1000 }),
        mark({ id: 2, time: Date.UTC(2026, 2, 20) / 1000 }),
      ],
      months,
    );
    expect(clusters.map((c) => c.time)).toEqual([months[1], months[2]]);
  });

  it("snaps a callout newer than the last bar onto it, rather than dropping it", () => {
    // The forming candle: a callout posted a minute ago, on a chart whose last
    // bar opened an hour ago. It belongs on that bar.
    const bar = bars(1_000_000, 3_600, 3);
    const [cluster] = clusterMarks([mark({ id: 1, time: bar[2]! + 1_800 })], bar);
    expect(cluster!.time).toBe(bar[2]);
  });

  it("drops a callout older than the first bar rather than pinning it to bar zero", () => {
    const bar = bars(1_000_000, 3_600, 3);
    expect(clusterMarks([mark({ id: 1, time: 999_999 })], bar)).toEqual([]);
  });

  it("has nothing to place when the chart has no bars", () => {
    expect(clusterMarks([mark({ id: 1, time: 1_000_000 })], [])).toEqual([]);
  });

  it("orders a cluster by stake, so the chart and the card agree", () => {
    const t = 1_000_000;
    const clusters = clusterMarks(
      [
        mark({ id: 1, time: t, valueUsd: 50 }),
        mark({ id: 2, time: t, valueUsd: 5_000 }),
        mark({ id: 3, time: t, valueUsd: 900 }),
      ],
      bars(t, 3_600, 2),
    );
    expect(clusters[0]!.marks.map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it("breaks a stake tie on id, so a fan cannot reshuffle under the cursor", () => {
    const t = 1_000_000;
    const ids = () =>
      clusterMarks(
        [
          mark({ id: 9, time: t, valueUsd: 100 }),
          mark({ id: 2, time: t, valueUsd: 100 }),
          mark({ id: 5, time: t, valueUsd: 100 }),
        ],
        bars(t, 3_600, 2),
      )[0]!.marks.map((m) => m.id);
    expect(ids()).toEqual([2, 5, 9]);
    expect(ids()).toEqual(ids());
  });

  it("prices the cluster at its largest callout, not an average", () => {
    const t = 1_000_000;
    const [cluster] = clusterMarks(
      [
        mark({ id: 1, time: t, valueUsd: 10, plotPrice: 100 }),
        mark({ id: 2, time: t, valueUsd: 9_000, plotPrice: 250 }),
      ],
      bars(t, 3_600, 2),
    );
    expect(cluster!.price).toBe(250);
  });

  it("fans everything when the cluster fits", () => {
    const t = 1_000_000;
    const [cluster] = clusterMarks(
      Array.from({ length: FAN_LIMIT }, (_, i) => mark({ id: i + 1, time: t })),
      bars(t, 3_600, 2),
    );
    expect(cluster!.fanned).toHaveLength(FAN_LIMIT);
    expect(cluster!.overflow).toBe(0);
  });

  it("gives the last slot to the counter once it does not, and counts itself in", () => {
    // The counter occupies a slot, so an overflowing cluster shows FAN_LIMIT - 1
    // avatars. The count must include the one whose slot the counter took —
    // otherwise +N is short by one and the numbers do not add up to the cluster.
    const t = 1_000_000;
    const [cluster] = clusterMarks(
      Array.from({ length: 14 }, (_, i) => mark({ id: i + 1, time: t })),
      bars(t, 3_600, 2),
    );
    expect(cluster!.fanned).toHaveLength(FAN_LIMIT - 1);
    expect(cluster!.overflow).toBe(14 - (FAN_LIMIT - 1));
    expect(cluster!.fanned.length + cluster!.overflow).toBe(cluster!.marks.length);
  });

  it("returns clusters in time order, whatever order the marks arrived in", () => {
    const bar = [10_000, 20_000, 30_000];
    const clusters = clusterMarks(
      [mark({ id: 1, time: 30_000 }), mark({ id: 2, time: 10_000 }), mark({ id: 3, time: 20_000 })],
      bar,
    );
    expect(clusters.map((c) => c.time)).toEqual(bar);
  });

  it("has nothing to say about an empty list", () => {
    expect(clusterMarks([], bars(1_000, 60, 5))).toEqual([]);
  });
});

describe("placeCard", () => {
  const card = { width: 330, height: 160 };
  const chart = { width: 800, height: 400 };

  it("sits to the right of the mark when there is room", () => {
    expect(placeCard(100, 100, card, chart).left).toBe(114);
  });

  it("flips to the left rather than sliding over the mark", () => {
    // A mark near the right edge: clamping would put the card ON it, which
    // covers the thing the reader is pointing at.
    const { left } = placeCard(760, 100, card, chart);
    expect(left).toBeLessThan(760);
    expect(left + card.width).toBeLessThanOrEqual(760);
  });

  it("keeps the card inside the chart on every edge", () => {
    for (const [x, y] of [
      [0, 0],
      [799, 399],
      [400, 395],
      [2, 380],
    ] as const) {
      const { left, top } = placeCard(x, y, card, chart);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(left + card.width).toBeLessThanOrEqual(chart.width - 8);
      expect(top + card.height).toBeLessThanOrEqual(chart.height - 8);
    }
  });
});
