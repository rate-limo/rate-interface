import { describe, expect, it } from "vitest";
import {
    ASSUMED_DAILY_VOLUME_USD,
    formatUsdPerDay,
    projectEarnings,
} from "./projectedEarnings";

const LP_FEE = 0.0005; // what the gateway reports today: 0.05% of a fill

describe("projectEarnings", () => {
    it("dilutes by the liquidity already in the band", () => {
        // Arc TITER/USDC as production holds it: $23.89 in the band.
        const r = projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: 23.89 });
        expect(r).not.toBeNull();
        expect(r!.share).toBeCloseTo(0.9767, 4);
        expect(r!.usdPerDay).toBeCloseTo(4.88, 2);
    });

    it("dilutes harder against a deeper pool", () => {
        // RISE KPRF1448/tUSD: $99.54, the deepest band pool on either chain.
        const r = projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: 99.54 });
        expect(r!.share).toBeCloseTo(0.90947, 5);
        expect(r!.usdPerDay).toBeCloseTo(4.55, 2);
    });

    it("treats an empty pool as empty, not unknown: the deposit takes it all", () => {
        const r = projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: 0 });
        expect(r!.share).toBe(1);
        expect(r!.usdPerDay).toBeCloseTo(5, 10);
    });

    it("reads a missing pool figure as empty rather than refusing", () => {
        const r = projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: null });
        expect(r!.share).toBe(1);
    });

    it("scales with the assumed volume, which is the caller's to state", () => {
        const a = projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: 0 })!;
        const b = projectEarnings({
            depositQuote: 1000,
            lpFeeRate: LP_FEE,
            poolLiquidityQuote: 0,
            assumedDailyVolume: ASSUMED_DAILY_VOLUME_USD * 2,
        })!;
        expect(b.usdPerDay).toBeCloseTo(a.usdPerDay * 2, 10);
    });

    it("refuses rather than returning a confident zero", () => {
        expect(projectEarnings({ depositQuote: 0, lpFeeRate: LP_FEE, poolLiquidityQuote: 0 })).toBeNull();
        expect(projectEarnings({ depositQuote: 1000, lpFeeRate: null, poolLiquidityQuote: 0 })).toBeNull();
        expect(projectEarnings({ depositQuote: 1000, lpFeeRate: 0, poolLiquidityQuote: 0 })).toBeNull();
        expect(projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: -1 })).toBeNull();
        expect(
            projectEarnings({ depositQuote: 1000, lpFeeRate: LP_FEE, poolLiquidityQuote: 0, assumedDailyVolume: 0 }),
        ).toBeNull();
    });
});

describe("formatUsdPerDay", () => {
    it("never prints $0.00", () => {
        expect(formatUsdPerDay(0.0004)).toBe("<$0.01");
        expect(formatUsdPerDay(0)).toBe("—");
    });

    it("prints cents", () => {
        expect(formatUsdPerDay(4.876)).toBe("$4.88");
        expect(formatUsdPerDay(0.12)).toBe("$0.12");
    });
});
