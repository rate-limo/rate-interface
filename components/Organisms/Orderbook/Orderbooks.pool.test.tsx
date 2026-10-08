// @vitest-environment jsdom
/**
 * The Pro ladder shows the POOL's depth, and says how far it reaches.
 *
 * The terminal's order book was built from resting orders alone, so on a banded
 * market it understated what a taker can actually fill against — the indexed
 * trades carry `origins: { pool, maker }` precisely because a fill comes from
 * either venue. Measured on Arc's ITRA/USDC: one resting bid, and 998 ITRA in
 * the pool beside it that the ladder never mentioned.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoPoolRow, PoolRow, bandHalfWidthPct, poolAmountLabel } from "./Orderbooks";
import { adjustDecimalLength } from "@/utils/number";

afterEach(cleanup);

/** Arc's ITRA/USDC band 2, read from `/api/liquidity/ranges`. */
const BAND = { amount: 998.04, minPrice: 1.01958, maxPrice: 1.02162 };

describe("bandHalfWidthPct", () => {
  it("recovers the tolerance a band was built from", () => {
    // `BandPool` prices at `marketPrice * (DENOM ± tolerance) / DENOM`, so the
    // interval is symmetric and its half-width IS the tolerance.
    expect(bandHalfWidthPct(BAND.minPrice, BAND.maxPrice)).toBe("0.10");
    expect(bandHalfWidthPct(100 * (1 - 0.0002), 100 * (1 + 0.0002))).toBe("0.02");
    expect(bandHalfWidthPct(100 * (1 - 0.0006), 100 * (1 + 0.0006))).toBe("0.06");
  });

  it("never rounds Arc's tightest band to a width of zero", () => {
    // 0.02% is a real band. Printing "±0.00%" would say it has no width.
    expect(bandHalfWidthPct(100 * (1 - 0.0002), 100 * (1 + 0.0002))).not.toBe("0.00");
  });

  it("refuses a degenerate or inverted interval rather than dividing by it", () => {
    expect(bandHalfWidthPct(1, 1)).toBe("0");
    expect(bandHalfWidthPct(2, 1)).toBe("0");
    expect(bandHalfWidthPct(0, 0)).toBe("0");
  });
});

describe("the ladder's pool row", () => {
  it("names the leg that side would actually consume", () => {
    // An ask fills from the pool's BASE inventory, a bid from its QUOTE.
    render(<PoolRow side="ask" pool={BAND} symbol="ITRA" />);
    expect(screen.getByText(/998\.04 ITRA/)).toBeTruthy();
  });

  it("reports the band's reach, not two prices it has no room for", () => {
    render(<PoolRow side="ask" pool={BAND} symbol="ITRA" />);
    expect(screen.getByText("±0.10%")).toBeTruthy();
  });

  it("keeps the absolute bounds reachable, in the title", () => {
    const { container } = render(<PoolRow side="bid" pool={BAND} symbol="USDC" />);
    const title = container.firstElementChild?.getAttribute("title") ?? "";
    expect(title).toContain("1.01958");
    expect(title).toContain("1.02162");
  });

  it("renders NOTHING where the pool holds none of this side's leg", () => {
    // A market with no pool, or a band with nothing on this side, must not
    // produce an empty row claiming zero depth.
    const { container } = render(<PoolRow side="ask" pool={null} symbol="ITRA" />);
    expect(container.firstChild).toBeNull();
  });

  it("takes no click, because a band has no single price to commit to", () => {
    // Every other row in this ladder sets the limit price to its own price.
    const { container } = render(<PoolRow side="ask" pool={BAND} symbol="ITRA" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.firstElementChild?.className ?? "").not.toContain("cursor-pointer");
  });
});

describe("poolAmountLabel", () => {
  it("abbreviates a launch pool's supply so the symbol survives a phone column", () => {
    // KPRF1448/tUSD on RISE: 199,000,000 KPRF rendered as "199,000,000 KPR…".
    expect(poolAmountLabel(199_000_000)).toBe("199M");
    expect(poolAmountLabel(66_333_333.33)).toBe("66.3M");
  });

  it("leaves small pools to the ladder's own formatter", () => {
    // Unchanged from before: what the row printed for KPRF's tUSD side.
    expect(poolAmountLabel(2095.4)).toBe(adjustDecimalLength(2095.4, 5));
    expect(poolAmountLabel(2095.4)).toBe("2,095");
  });
});

describe("NoPoolRow", () => {
  it("says the market has no pool instead of leaving a gap", () => {
    render(<NoPoolRow />);
    expect(screen.getByText("no pool")).toBeTruthy();
    expect(screen.getByText(/orders only/)).toBeTruthy();
  });
});
