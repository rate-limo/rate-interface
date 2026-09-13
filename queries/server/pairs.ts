"use server";
import { PonderLinks } from "@/consts";
import { SpotPair } from "@/types";

export async function getPairs(networkName: string, pageSize: number, page: number, options: string) {
    let url;
    if (options === "") {
        url = `${PonderLinks[networkName]}/api/pairs/${pageSize}/${page}`;
    } else if (options === "top-gainer") {
        url = `${PonderLinks[networkName]}/api/pairs/top-gainer/${pageSize}/${page}`;
    } else if (options === "top-loser") {
        url = `${PonderLinks[networkName]}/api/pairs/top-loser/${pageSize}/${page}`;
    } else if (options === "new") {
        url = `${PonderLinks[networkName]}/api/pairs/new/${pageSize}/${page}`;
    }
    const response = await fetch(url as string, { next: { revalidate: 0 } });
    // A list endpoint's error body is `{error: "..."}`, which has no `pairs`
    // key — parsing it regardless handed every consumer an object that looks
    // fine until something calls `.pairs.map`. Degrade to an empty page instead.
    if (!response.ok) {
        console.warn(`getPairs: ${response.status} from ${url}`);
        return { pairs: [], totalCount: 0, totalPages: 0, pageSize };
    }
    return await response.json();
}

/** One `{pairs}` answer, degraded to an empty list on anything unexpected. */
async function readBasePairs(url: string): Promise<SpotPair[]> {
    const res = await fetch(url, { next: { revalidate: 60 } });
    // A 404 is the gated route's "no visible market" and, on a gateway deployed
    // before the unlisted companion existed, also "no such route" — both mean
    // "nothing from here", and neither may take down the other half.
    if (!res.ok) {
        console.warn(`getBasePairs: ${res.status} from ${url}`);
        return [];
    }
    const body = (await res.json().catch(() => null)) as { pairs?: unknown } | null;
    return Array.isArray(body?.pairs) ? (body.pairs as SpotPair[]) : [];
}

/**
 * A token's markets — LISTED AND UNLISTED, listed first.
 *
 * ## Why the second request exists
 *
 * `/api/basePairs/:symbol` is filtered on `visiblePair()`, so before anything has
 * graduated it answers 404 for every token on the chain. This is the token
 * profile's only market lookup, so the Action Dock's Buy/Sell/LP rendered over
 * "Pick a market to continue" on tokens whose markets are live and trading —
 * `/api/pairs/unlisted` listed them the whole time.
 *
 * That is the failure apps/web/CLAUDE.md records for the pair profile, which was
 * fixed by moving to the ungated `/api/pair/symbol/:base/:quote`. A gated read
 * behind an ungated link fails silently in both directions: the page looks
 * correct, the gateway looks correct, and the market is simply invisible.
 *
 * ## Listed first, always
 *
 * Order is the only thing carrying the distinction here — `dayQuoteTvlUSD` would
 * routinely put an unlisted market above a listed one, and the caller picks
 * `[0]` as the default. `verified` travels on every row, so a surface that wants
 * to LABEL them (the profile's Unlisted chip) still can; this only decides which
 * market the page opens on.
 *
 * Unlisted, not hidden: a market nobody can reach cannot attract the quote
 * liquidity it needs to graduate, and the dock is where that liquidity is added.
 */
export async function getBasePairs(networkName: string, baseSymbol: string): Promise<{
    pairs: SpotPair[];
}> {
    const ponderLink = PonderLinks[networkName];
    // Both at once: they are independent reads, and one 404ing is the normal case
    // rather than a reason to wait.
    const [listed, unlisted] = await Promise.all([
        readBasePairs(`${ponderLink}/api/basePairs/${baseSymbol}`),
        readBasePairs(`${ponderLink}/api/basePairs/unlisted/${baseSymbol}`),
    ]);

    // Keyed by pair id, listed winning: the two predicates are inverses, so an
    // overlap means a market graduated between the two requests. Taking the
    // listed row there is the one that cannot render a stale Unlisted chip.
    const byId = new Map<string, SpotPair>();
    for (const pair of [...listed, ...unlisted]) {
        if (pair?.id && !byId.has(pair.id)) byId.set(pair.id, pair);
    }
    return { pairs: [...byId.values()] };
}

// A pair endpoint's error body is `{error: "..."}`, which has no `symbol` — the
// same shape trap `getPairs` above documents. Both checks matter and neither is
// redundant: `res.ok` catches the 404s the gateway sends, and the `symbol` guard
// catches a 200 carrying an error body, which is what `/api/pair/default` served
// for every unindexed default pair until the gateway was fixed to 404. Callers
// that skipped both got an object typed `SpotPair` whose every field was
// undefined, and rendered a header built from nothing.
function asPair(data: unknown): SpotPair | null {
    const pair = data as SpotPair | undefined;
    return pair?.symbol ? pair : null;
}

export async function getPairBySymbol(networkName: string, baseSymbol: string, quoteSymbol: string): Promise<SpotPair | null> {
    const ponderLink = PonderLinks[networkName];
    const url = `${ponderLink}/api/pair/symbol/${baseSymbol}/${quoteSymbol}`;
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) {
        console.warn(`getPairBySymbol: ${res.status} for ${baseSymbol}/${quoteSymbol}`);
        return null;
    }
    return asPair(await res.json());
}

export async function getDefaultPair(networkName: string): Promise<SpotPair | null> {
    const ponderLink = PonderLinks[networkName];
    const res = await fetch(`${ponderLink}/api/pair/default`, { next: { revalidate: 0 } })
    if (!res.ok) {
        console.warn(`getDefaultPair: ${res.status} for ${networkName}`);
        return null;
    }
    return asPair(await res.json());
}
