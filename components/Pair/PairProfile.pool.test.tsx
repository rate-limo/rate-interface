// @vitest-environment jsdom
/**
 * The two depth surfaces, rendered, with a band pool behind them.
 *
 * What this file exists for: the pair profile fetched the pool's bands for its
 * liquidity chart and no other surface read them, so a market whose depth sat in
 * a band showed that depth on one tab and denied it on the next. The depth chart
 * drew the order book alone and the ladder listed the order book alone, on pools
 * holding real liquidity.
 *
 * `derive.test.ts` pins the arithmetic. These assertions are about the DOM: that
 * the band survives the trip from the hook's payload to something a reader can
 * actually see, and — just as load-bearing — that a market with NO pool still
 * says nothing about one rather than rendering a zero.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BookSide, DepthChart } from "./PairProfile";
import type { PoolBand } from "@/lib/pair/derive";
import { poolSideInventory } from "@/lib/pair/derive";
import type { BookLevel } from "@/lib/pair/types";

afterEach(cleanup);

/**
 * Arc's TITER/USDC band, read through `/api/liquidity/ranges` on 2026-09-21.
 *
 * Real numbers rather than round ones because the width is the whole point: at
 * ±0.02% around spot this band is four hundred times narrower than the ±2%
 * window the profile measures, and narrower than the gap between two adjacent
 * ladder rows. Anything that needs a WIDE band to show up passes on a fixture of
 * `[0.5, 1.5]` and fails on the venue.
 */
const BAND: PoolBand = {
  minPrice: 1.02081939528,
  maxPrice: 1.0212278047199999,
  baseAmount: 996.854453,
  quoteAmount: 3.509024,
};
const MID = 1.0210236;

const asks: BookLevel[] = [
  { price: 1.03, size: 12, cumulative: 12 },
  { price: 1.04, size: 8, cumulative: 20 },
];
const bids: BookLevel[] = [
  { price: 1.01, size: 15, cumulative: 15 },
  { price: 1.0, size: 5, cumulative: 20 },
];

describe("DepthChart — the pool reaches the curve", () => {
  const poolFill = (container: HTMLElement) =>
    [...container.querySelectorAll("path")].filter((node) =>
      (node.getAttribute("fill") ?? "").startsWith("url(#depth-pool-"),
    );

  it("draws a pool ribbon on both sides when the market has a band", () => {
    const { container } = render(
      <DepthChart bids={bids} asks={asks} bands={[BAND]} mid={MID} quote="USDC" />,
    );
    const filled = poolFill(container).filter((node) => (node.getAttribute("d") ?? "").length > 0);
    expect(filled).toHaveLength(2);
  });

  it("hatches the pool in each side's own colour rather than a third hue", () => {
    const { container } = render(
      <DepthChart bids={bids} asks={asks} bands={[BAND]} mid={MID} quote="USDC" />,
    );
    const bid = container.querySelector("#depth-pool-bid line");
    const ask = container.querySelector("#depth-pool-ask line");
    expect(bid?.getAttribute("stroke")).toBe("var(--m-success)");
    expect(ask?.getAttribute("stroke")).toBe("var(--m-error)");
  });

  it("draws a pool-only market instead of claiming it has no depth", () => {
    const { container } = render(
      <DepthChart bids={[]} asks={[]} bands={[BAND]} mid={MID} quote="USDC" />,
    );
    expect(screen.queryByText(/No resting depth/i)).toBeNull();
    expect(poolFill(container).some((node) => (node.getAttribute("d") ?? "").length > 0)).toBe(true);
  });

  it("still refuses a market with neither book nor pool", () => {
    render(<DepthChart bids={[]} asks={[]} bands={[]} mid={MID} quote="USDC" />);
    expect(screen.getByText(/No resting depth/i)).toBeTruthy();
  });

  it("draws no ribbon at all where there is no pool", () => {
    const { container } = render(
      <DepthChart bids={bids} asks={asks} bands={[]} mid={MID} quote="USDC" />,
    );
    // The <defs> patterns are static; what must be empty is the geometry.
    expect(poolFill(container).every((node) => (node.getAttribute("d") ?? "") === "")).toBe(true);
  });

  it("labels itself as covering both venues, in the quote unit it plots", () => {
    render(<DepthChart bids={bids} asks={asks} bands={[BAND]} mid={MID} quote="USDC" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Cumulative USDC depth — order book and pool",
    );
  });
});

describe("BookSide — the pool reaches the ladder", () => {
  it("names the pool's base inventory and its own range under the asks", () => {
    render(
      <BookSide
        levels={asks}
        side="ask"
        quote="USDC"
        base="TITER"
        pool={poolSideInventory([BAND], "ask")}
      />,
    );
    expect(screen.getByText("pool")).toBeTruthy();
    // The amount a taker would actually consume on this side — the BASE leg —
    // and the band's own interval, not the rows above it.
    expect(screen.getByText(/996\.85 TITER/)).toBeTruthy();
  });

  it("names the QUOTE leg under the bids, because that is what a bid fills from", () => {
    render(
      <BookSide
        levels={bids}
        side="bid"
        quote="USDC"
        base="TITER"
        pool={poolSideInventory([BAND], "bid")}
      />,
    );
    expect(screen.getByText(/3\.51 USDC/)).toBeTruthy();
  });

  it("shows the pool on a side with no resting orders at all", () => {
    render(
      <BookSide levels={[]} side="ask" quote="USDC" base="TITER" pool={poolSideInventory([BAND], "ask")} />,
    );
    // Both are true and both are said: nothing is RESTING, and the pool is there.
    expect(screen.getByText(/nothing resting on the ask side/i)).toBeTruthy();
    expect(screen.getByText("pool")).toBeTruthy();
  });

  it("says nothing about a pool the market does not have", () => {
    render(<BookSide levels={asks} side="ask" quote="USDC" base="TITER" pool={null} />);
    expect(screen.queryByText("pool")).toBeNull();
  });

  it("says nothing rather than zero when the pool holds none of this side's leg", () => {
    const baseOnly: PoolBand = { minPrice: 1, maxPrice: 1.1, baseAmount: 10, quoteAmount: 0 };
    render(
      <BookSide levels={bids} side="bid" quote="USDC" base="TITER" pool={poolSideInventory([baseOnly], "bid")} />,
    );
    expect(screen.queryByText("pool")).toBeNull();
  });
});

/*
 * The chart and the caption have to be centred on the same price.
 *
 * `DepthChart` falls back to the midpoint of the DATA when it is given no
 * centre, while the "Bid depth / Ask depth" figures printed underneath are
 * measured from `depthAnchor`, which falls back to the market rate. On a
 * one-sided book — the normal state of a freshly launched coin — those two are
 * different prices, and the side a band counts towards swings with them. The
 * call site passes `anchor` for exactly this reason; these pin the behaviour it
 * depends on.
 */
describe("DepthChart — centred where the caption is measured from", () => {
  const farAsks: BookLevel[] = [{ price: 2, size: 10, cumulative: 10 }];

  it("centres on the anchor it is given, not on the midpoint of the levels", () => {
    render(<DepthChart bids={[]} asks={farAsks} bands={[]} mid={MID} quote="USDC" />);
    // The mid marker is drawn with the anchor's own rate beside it. Were the
    // chart falling back to the data it would read 2 — the only level present,
    // and the midpoint of a range that has collapsed onto it.
    const labels = screen.getAllByText((_, node) => node?.tagName === "text").map(
      (node) => node.textContent?.trim(),
    );
    expect(labels).toContain("1.021");
    expect(labels).not.toContain("2");
  });

  it("puts a band on the side of the anchor it actually sits on", () => {
    // Every unit of this band is BELOW the anchor, so it is bid depth and the
    // ask ribbon must stay empty.
    const { container } = render(
      <DepthChart bids={bids} asks={farAsks} bands={[BAND]} mid={BAND.maxPrice} quote="USDC" />,
    );
    const filled = (id: string) =>
      [...container.querySelectorAll("path")].filter(
        (node) => node.getAttribute("fill") === `url(#${id})` && (node.getAttribute("d") ?? "") !== "",
      );
    expect(filled("depth-pool-bid")).toHaveLength(1);
    expect(filled("depth-pool-ask")).toHaveLength(0);
  });
});

/**
 * WHERE the pool line sits, which is a claim about what fills first.
 *
 * The ladder is ordered by distance from the market, and the pool line was
 * rendered after the rows on both sides. Asks reverse their rows, so it landed
 * against the market divider by accident; bids do not, so it ended up below an
 * order four percent away — on Arc's TITER/USDC, beneath a resting bid at 0.98
 * while the pool's own bands straddle the market at 1.0202.
 */
describe("BookSide — the pool line's place in the ladder", () => {
  const POOL = { amount: 14.96, minPrice: 1.0192, maxPrice: 1.0212 };
  /** Four percent below the market, i.e. further out than the pool. */
  const FAR_BID: BookLevel[] = [{ price: 0.98, size: 13.23, cumulative: 13.23 }];

  /**
   * Document order, not a child index: the pool line carries its own caption, so
   * it is a section rather than a single node, and an index would break on a
   * wrapper that changes nothing a reader can see.
   */
  const poolComesBeforeRows = (side: "bid" | "ask", levels: BookLevel[]) => {
    render(<BookSide levels={levels} side={side} base="TITER" quote="USDC" pool={POOL} />);
    const pool = screen.getByTestId(`book-pool-${side}`);
    const firstRow = screen.getByText(String(levels[0]!.price));
    // Node.DOCUMENT_POSITION_FOLLOWING = the row comes after the pool.
    return Boolean(pool.compareDocumentPosition(firstRow) & 4);
  };

  it("puts the pool ABOVE the resting bids, because it is nearer the market", () => {
    expect(
      poolComesBeforeRows("bid", FAR_BID),
      "the pool is printed below an order four percent further out",
    ).toBe(true);
  });

  it("keeps the pool below the asks, where the reversed rows already put the best one", () => {
    const asks: BookLevel[] = [{ price: 1.06, size: 5, cumulative: 5 }];
    expect(poolComesBeforeRows("ask", asks)).toBe(false);
  });

  /**
   * ALL of the small print sits in the pool section — not one line there and
   * another at the foot of the side, which on a bid put the two either end of a
   * resting order.
   */
  it("keeps the whole caption inside the pool section", () => {
    render(<BookSide levels={FAR_BID} side="bid" base="TITER" quote="USDC" pool={POOL} />);
    const section = screen.getByTestId("book-pool-bid");
    expect(section.textContent).toMatch(/size in base, price in USDC/i);
    expect(section.textContent).toMatch(/pool in USDC across its own range/i);

    // And nowhere else: exactly one copy of each clause on the side.
    const side = screen.getByTestId("book-side-bid");
    expect(side.textContent?.match(/size in base/gi)).toHaveLength(1);
  });

  /**
   * The caption is written for the resting orders, whose sizes are in base. The
   * pool line is in the leg that side would consume, which on a bid is quote —
   * so "size in base" used to sit directly above a figure printed in USDC.
   */
  it("names the pool's own leg, which is not the rows' unit on a bid", () => {
    render(<BookSide levels={FAR_BID} side="bid" base="TITER" quote="USDC" pool={POOL} />);
    expect(screen.getByText(/pool in USDC across its own range/i)).toBeTruthy();
  });

  it("names base on the ask side, which is what an ask actually fills from", () => {
    render(<BookSide levels={[]} side="ask" base="TITER" quote="USDC" pool={POOL} />);
    expect(screen.getByText(/pool in TITER across its own range/i)).toBeTruthy();
  });

  it("says nothing about a pool's leg when there is no pool", () => {
    render(<BookSide levels={FAR_BID} side="bid" base="TITER" quote="USDC" pool={null} />);
    expect(screen.queryByText(/across its own range/i)).toBeNull();
    expect(screen.queryByTestId("book-pool-bid")).toBeNull();
    // The rows' own caption still has to appear — it moved INTO the pool
    // section, so a market with no pool must not lose it.
    expect(screen.getByText(/size in base, price in USDC/i)).toBeTruthy();
  });
});
