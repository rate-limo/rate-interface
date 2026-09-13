"use server";
import { getApiUrl } from "@/lib/realtime/ws-url";

/**
 * Liquidity reads for the pair profile.
 *
 * ## These return null. They do not throw. That is the point.
 *
 * The sibling modules in this directory (`trades.ts`, `orders.ts`,
 * `orderhistories.ts`, `tradehistories.ts`) throw on any non-ok response. On
 * 2026-08-07 that convention took every page in the app down: a decorative strip
 * (`PumpNotificationBanner`) awaited one of them with no `.catch()`, the gateway
 * answered 429 — which its rate limiter is designed to do — and the resulting
 * unhandled rejection replaced the whole tree, sidebar included, with Next's
 * "This page couldn't load". The bug was reported as "the links in the left
 * panel don't work"; there was no left panel.
 *
 * The pair profile is a reading surface whose fields are ALL nullable by design
 * (see `lib/pair/types.ts`: an empty book "is a fact about the market rather
 * than a loading state"). So an unreachable or rate-limited gateway is a null,
 * the UI renders an em-dash and says why, and the page survives.
 *
 * `console.warn` rather than silence: an outage that leaves no trace is what
 * made the above take a full debugging session to find.
 */

/** A pool's existence, price and REALISED fee APR. See the gateway's /liquidity/pool. */
export type PoolLiquidity = {
    exists: boolean;
    price: number | null;
    pairSymbol: string | null;
    /**
     * Pool-level realised fee APR, as a percentage.
     *
     * **Null means not measurable — no in-range liquidity, or no indexed volume.
     * It does not mean zero.** `0` would assert the pool earned nothing, which is
     * a much stronger claim than "we could not measure". Render an em-dash.
     */
    aprPct: number | null;
    /** Inputs used by the gateway to derive realised APR and 24h LP fees. */
    aprBasis?: {
        poolDayQuoteVolume: number;
        inRangeLiquidityQuote: number;
        lpFeeRate: number;
    } | null;
};

/**
 * What a PROSPECTIVE deposit of a given size and range would earn.
 *
 * A different question from `PoolLiquidity.aprPct`, and the distinction is the
 * reason both exist. That one is realised: what the pool as a whole has earned
 * over the trailing day. This one takes YOUR amounts and YOUR range and
 * estimates what that specific position would earn — so a narrow range around
 * the price and a wide one report different numbers, which is the entire
 * decision a depositor is making.
 *
 * `lib/pair/types.ts` already documented the split, for the pair profile, which
 * wants the realised figure. The deposit surfaces want this one and until now
 * nothing called it: the route, its tier weighting and its age weighting were
 * built and correct, and had no reader.
 */
export type ProspectiveApr = {
    /**
     * The weighted-tier estimate, as a percentage.
     *
     * **Null means not measurable, and is NOT zero.** The gateway returns null
     * when the pair has no indexed volume — its comment is "refuse to invent a
     * number" — and returns a real `0` for an out-of-range deposit, which earns
     * nothing until the price enters the band. Those are different statements
     * and the UI has to be able to tell them apart, which is why `inRange`
     * travels with the number.
     */
    aprPct: number | null;
    /** Naive pro-rata share of pool fees, for comparison against `aprPct`. */
    proRataPct: number | null;
    /** False when the chosen band does not straddle the current price. */
    inRange: boolean;
    price: number | null;
};

/**
 * Estimate a deposit's APR. Null on anything that is not a usable answer.
 *
 * Same non-throwing contract as `getPoolLiquidity` above, and it matters more
 * here: the estimator 404s for a market that has an order book but no
 * `Pool.sol` pool, which on this venue is the common case, not an error.
 */
export async function getProspectiveApr(
    networkName: string,
    base: string,
    quote: string,
    deposit: {
        amountBase?: number;
        amountQuote?: number;
        minPrice?: number;
        maxPrice?: number;
    },
): Promise<ProspectiveApr | null> {
    if (!base || !quote) return null;

    const amountBase = Number.isFinite(deposit.amountBase) ? Math.max(0, deposit.amountBase!) : 0;
    const amountQuote = Number.isFinite(deposit.amountQuote) ? Math.max(0, deposit.amountQuote!) : 0;
    // The route 400s on a non-positive total. Asking anyway would put a
    // guaranteed-failing request behind every keystroke that clears the field.
    if (amountBase + amountQuote <= 0) return null;

    const params = new URLSearchParams();
    if (amountBase > 0) params.set("amountBase", String(amountBase));
    if (amountQuote > 0) params.set("amountQuote", String(amountQuote));
    // Omitted rather than sent as 0: the gateway defaults an absent bound to
    // price +/-5%, and 0 is a legitimate-looking minPrice that would silently
    // widen the band to everything below the price.
    if (deposit.minPrice && deposit.minPrice > 0) params.set("minPrice", String(deposit.minPrice));
    if (deposit.maxPrice && deposit.maxPrice > 0) params.set("maxPrice", String(deposit.maxPrice));

    const url = `${getApiUrl(networkName)}/api/liquidity/apr/${base}/${quote}?${params.toString()}`;
    const data = (await readJson(url, "getProspectiveApr")) as Record<string, unknown> | null;
    if (!data) return null;

    return {
        aprPct: typeof data.aprEstimatePct === "number" ? data.aprEstimatePct : null,
        proRataPct: typeof data.aprProRataPct === "number" ? data.aprProRataPct : null,
        inRange: data.inRange === true,
        price: typeof data.price === "number" ? data.price : null,
    };
}

/**
 * One band position owned by a wallet.
 *
 * Deliberately NOT an `LpPosition`: a band has no min/max price, so it carries a
 * share count and a band index instead of two amounts and a range. Folding the
 * two shapes would mean inventing bounds nothing on chain agrees with.
 */
export type BandLpPosition = {
    pool: string;
    positionId: string | null;
    tokenId: string | null;
    band: number;
    shares: number | null;
    base: string | null;
    quote: string | null;
    pairSymbol: string | null;
    price: number | null;
};

/** One LP range owned by a wallet, as the gateway returns it. */
export type LpPosition = {
    pool: string | null;
    base: string | null;
    quote: string | null;
    baseAmount: number | null;
    quoteAmount: number | null;
    minPrice: number;
    maxPrice: number;
    active: boolean;
    inRange: boolean;
    pairSymbol: string | null;
};

async function readJson(url: string, label: string): Promise<unknown | null> {
    try {
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) {
            // 429 is expected under load and must never reach the page as an
            // exception; 404 means "no such pool", which is also not an error.
            console.warn(`${label}: ${res.status} for ${url}`);
            return null;
        }
        return await res.json();
    } catch (error) {
        console.warn(`${label}: request failed for ${url}`, error);
        return null;
    }
}

/**
 * Pool existence, price and realised APR for a market.
 *
 * Returns null when the gateway is unreachable or answers non-ok, AND when the
 * pool simply does not exist — the caller treats both as "no LP economics to
 * show", because it renders the same either way.
 */
export async function getPoolLiquidity(
    networkName: string,
    base: string,
    quote: string,
): Promise<PoolLiquidity | null> {
    if (!base || !quote) return null;
    const url = `${getApiUrl(networkName)}/api/liquidity/pool/${base}/${quote}`;
    const data = (await readJson(url, "getPoolLiquidity")) as Record<string, unknown> | null;
    if (!data || data.exists !== true) return null;

    return {
        exists: true,
        price: typeof data.price === "number" ? data.price : null,
        pairSymbol: typeof data.pairSymbol === "string" ? data.pairSymbol : null,
        // Absent from an older gateway that predates the field. Undefined reads as
        // null, i.e. "not measurable", which is the safe direction: it renders a
        // dash rather than inventing a yield.
        aprPct: typeof data.aprPct === "number" ? data.aprPct : null,
        aprBasis:
            data.aprBasis && typeof data.aprBasis === "object"
                ? {
                    poolDayQuoteVolume: Number((data.aprBasis as Record<string, unknown>).poolDayQuoteVolume) || 0,
                    inRangeLiquidityQuote: Number((data.aprBasis as Record<string, unknown>).inRangeLiquidityQuote) || 0,
                    lpFeeRate: Number((data.aprBasis as Record<string, unknown>).lpFeeRate) || 0,
                }
                : null,
    };
}

/**
 * Every LP range a wallet owns, across pools. The caller narrows to the pool it
 * cares about — the gateway has no per-pool variant, and one read the profile
 * can reuse beats a second round trip.
 */
export async function getLpPositions(
    networkName: string,
    address: string,
): Promise<{ ranges: LpPosition[]; bands: BandLpPosition[] } | null> {
    if (!address) return null;
    const url = `${getApiUrl(networkName)}/api/liquidity/positions/${address}`;
    const data = (await readJson(url, "getLpPositions")) as {
        positions?: unknown;
        bandPositions?: unknown;
    } | null;
    if (!data || !Array.isArray(data.positions)) return null;
    return {
        ranges: data.positions as LpPosition[],
        // Absent from a gateway that predates band indexing, which reads as an
        // empty list rather than an error — the same degrade rule the rest of
        // this module follows.
        bands: Array.isArray(data.bandPositions) ? (data.bandPositions as BandLpPosition[]) : [],
    };
}
