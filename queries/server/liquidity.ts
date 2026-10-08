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
        /**
         * How the figure was reached, or why it is absent — `realised-band-fee`
         * when measured, one of the `band-no-*` reasons when not. Carried so the
         * deposit card can name the reason instead of guessing at one.
         */
        method: string | null;
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
    /**
     * False when this is the POOL's own rate rather than one diluted by a
     * deposit — i.e. before any amount has been entered.
     *
     * The card used to show an em-dash until a number was typed, under the
     * caption "it appears once this pool has indexed fills to measure", which on
     * a pool with fills is a false statement about why. The pool's realised rate
     * is knowable with no deposit at all; only the DILUTION needs a size. So the
     * undiluted figure is shown first and refined once there is one, and the
     * caption follows this flag rather than claiming data is missing.
     */
    diluted: boolean;
    /**
     * WHY there is no number, when there is no number — `basis.method` verbatim
     * from the gateway.
     *
     * A bare em-dash reads as a broken row. The gateway already distinguishes
     * "no indexed volume" from `unavailable-for-band-pool` (its estimator has no
     * implementation for band pools, which is every pool Iter opens since
     * 2026-09-05), and throwing that away meant the UI could only shrug. It is a
     * REASON string for display, never something to branch value on.
     */
    method: string | null;
    /** Naive pro-rata share of pool fees, for comparison against `aprPct`. */
    proRataPct: number | null;
    /** False when the chosen band does not straddle the current price. */
    inRange: boolean;
    price: number | null;
    /**
     * The LP's cut of a fill, as a fraction (0.0005 = 0.05%), and the quote
     * already in the band diluting a deposit.
     *
     * Both are MEASURED and both survive when `aprPct` is null, which is the
     * case they exist for: a pool with liquidity and no fills in 24h can still
     * say what it charges and how crowded it is, and the Earn card uses the two
     * to state what a deposit earns at an assumed volume. Null when the gateway
     * omits them, so a caller cannot mistake absence for zero.
     */
    lpFeeRate: number | null;
    poolLiquidityQuote: number | null;
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
    /*
     * No amount yet — answer with the POOL's own rate instead of nothing.
     *
     * `/liquidity/apr` 400s on a non-positive total, and asking anyway would put
     * a guaranteed-failing request behind every keystroke that clears the field.
     * But "we cannot dilute a deposit that does not exist" is not the same as
     * "there is no rate": `/liquidity/pool` computes the realised band APR from
     * the pool's own fees and reserves, with no deposit in the question at all.
     *
     * Verified on Arc's ITRA/USDC: the deposit card printed an em-dash while
     * that route returned `aprPct: 0.06`, `method: "realised-band-fee"`, over
     * `poolDayQuoteVolume: 3.499999`. The number was one call away the whole
     * time, and the card said the pool had no fills to measure.
     */
    if (amountBase + amountQuote <= 0) {
        const pool = await getPoolLiquidity(networkName, base, quote);
        if (!pool?.exists) return null;
        return {
            aprPct: typeof pool.aprPct === "number" ? pool.aprPct : null,
            diluted: false,
            method: pool.aprBasis?.method ?? null,
            proRataPct: null,
            // The same two measured fields, from this route's own basis: it
            // names the in-range liquidity rather than the band total, which is
            // the figure a deposit is actually diluted against.
            lpFeeRate: pool.aprBasis?.lpFeeRate ?? null,
            poolLiquidityQuote: pool.aprBasis?.inRangeLiquidityQuote ?? null,
            // A band re-anchors to the market price on every swap, so a deposit
            // into one is in range by construction. Nothing is out of range
            // until a RANGE has been chosen, which is what the amount starts.
            inRange: true,
            price: typeof pool.price === "number" ? pool.price : null,
        };
    }

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

    const basis = data.basis as
        | { method?: unknown; lpFeeRate?: unknown; bandLiquidityQuote?: unknown }
        | null
        | undefined;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

    return {
        aprPct: typeof data.aprEstimatePct === "number" ? data.aprEstimatePct : null,
        diluted: true,
        method: typeof basis?.method === "string" ? basis.method : null,
        proRataPct: typeof data.aprProRataPct === "number" ? data.aprProRataPct : null,
        inRange: data.inRange === true,
        price: typeof data.price === "number" ? data.price : null,
        lpFeeRate: num(basis?.lpFeeRate),
        poolLiquidityQuote: num(basis?.bandLiquidityQuote),
    };
}

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
                    method:
                        typeof (data.aprBasis as Record<string, unknown>).method === "string"
                            ? ((data.aprBasis as Record<string, unknown>).method as string)
                            : null,
                    poolDayQuoteVolume: Number((data.aprBasis as Record<string, unknown>).poolDayQuoteVolume) || 0,
                    inRangeLiquidityQuote: Number((data.aprBasis as Record<string, unknown>).inRangeLiquidityQuote) || 0,
                    lpFeeRate: Number((data.aprBasis as Record<string, unknown>).lpFeeRate) || 0,
                }
                : null,
    };
}

/**
 * Every Pool.sol-generation LP RANGE a wallet owns, across pools.
 *
 * Band LP positions are not here: one LP token holds a whole band ladder (v2), and
 * those are read per token through `fetchLpPositions` (hooks/useLpPositions), which
 * joins the gateway's per-token ledger with the chain's live view.
 */
export async function getLpPositions(networkName: string, address: string): Promise<{ ranges: LpPosition[] } | null> {
    if (!address) return null;
    const url = `${getApiUrl(networkName)}/api/liquidity/positions/${address}`;
    const data = (await readJson(url, "getLpPositions")) as { positions?: unknown } | null;
    if (!data) return null;
    return { ranges: Array.isArray(data.positions) ? (data.positions as LpPosition[]) : [] };
}
