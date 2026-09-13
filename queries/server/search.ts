"use server";
import { getApiUrl } from "@/lib/realtime/ws-url";
import { PonderLinks, supportedChains } from "@/consts";

export type SearchTokenResult = {
    type: "token";
    id: string;
    symbol: string;
    name: string;
    ticker: string;
    logoURI: string;
    /** Undefined from an older gateway; treated as unlisted (see isUnlisted). */
    verified?: boolean | null;
    /**
     * Which chain this hit is on. ALWAYS set — by the single-chain read and by
     * the fan-out alike, because "sometimes present" is a worse contract than
     * either alternative and every consumer would have to guard it.
     *
     * Not cosmetic: the same symbol exists on several chains as different
     * contracts, so two rows reading "USDC" that open different markets are
     * indistinguishable without it.
     */
    chain?: string;
};

export type SearchPairResult = {
    type: "pair";
    id: string;
    symbol: string;
    ticker: string;
    base: string;
    quote: string;
    baseSymbol: string;
    quoteSymbol: string;
    /**
     * Each side's artwork, joined by the gateway from `spotTokens`.
     *
     * `base`/`quote` are addresses, so without these a client has a market's
     * identity and no way to draw either half of it — which is why the search
     * modal rendered two letters of the base symbol in a grey circle.
     *
     * NULL, never absent, when a token has no logo: the client falls back to
     * hued initials, and it has to tell that apart from an older gateway not
     * sending the field at all.
     */
    baseLogoURI?: string | null;
    quoteLogoURI?: string | null;
    verified?: boolean | null;
    /** See SearchTokenResult.chain. */
    chain?: string;
};

export type SearchResult = {
    tokens: SearchTokenResult[];
    pairs: SearchPairResult[];
};

const EMPTY_RESULT: SearchResult = { tokens: [], pairs: [] };

/**
 * Searches ONE chain's token/pair index via the gateway's `/api/search` route.
 * Uses `getApiUrl` (not raw `PonderLinks`) so the per-network/dev-override
 * resolver logic in ws-url.ts applies uniformly here too.
 *
 * This is the per-chain primitive: a later cross-chain fan-out (searching
 * every network in `supportedChains` and merging results) would map this
 * over that list. Only the active-chain call site (useSearch) exists today.
 */
/**
 * The raw read, which THROWS on a bad response.
 *
 * `searchChain` swallows and logs, which is right for a single-chain call — a
 * dead gateway there means no results either way. In a fan-out it is not: a
 * chain that answered "nothing" and a chain that never answered have to be
 * distinguishable, or an outage silently narrows the venue and reads as though
 * those markets do not exist.
 */
async function fetchChainSearch(
    networkName: string,
    trimmed: string,
    limit: number,
): Promise<SearchResult> {
    const url = `${getApiUrl(networkName)}/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`${networkName}: /api/search returned ${res.status}`);
    const data = await res.json();
    const tokens: SearchTokenResult[] = (data.tokens ?? []).map((t: SearchTokenResult) => ({
        ...t,
        chain: networkName,
    }));
    const pairs: SearchPairResult[] = (data.pairs ?? []).map((p: SearchPairResult) => ({
        ...p,
        chain: networkName,
    }));
    return { tokens, pairs };
}

export async function searchChain(
    networkName: string,
    q: string,
    limit: number = 15,
): Promise<SearchResult> {
    const trimmed = q.trim();
    if (trimmed === "") {
        return EMPTY_RESULT;
    }
    try {
        return await fetchChainSearch(networkName, trimmed, limit);
    } catch (error) {
        // A down/misconfigured gateway otherwise looks identical to "no matches"
        // — log so an outage is diagnosable rather than silent.
        console.warn(`searchChain: ${networkName} search failed for "${trimmed}"`, error);
        return EMPTY_RESULT;
    }
}

export interface AllChainSearchResult extends SearchResult {
    /** Chains that failed. Non-empty means the result set is incomplete. */
    chainsMissing: string[];
    chainsUsed: string[];
}

/**
 * Search every served chain at once.
 *
 * `apps/web/CLAUDE.md` named the three things this has to get right, and they
 * are why it is not simply `Promise.all`:
 *
 *  - N gateway calls per settled keystroke, not per keystroke — the debounce in
 *    `createSearchEngine` already guarantees that, and this rides it.
 *  - A per-row chain badge, which is why every row is stamped with its origin.
 *  - One chain being down must NOT look like no matches. `allSettled` keeps the
 *    chains that answered, and the failures are reported rather than folded into
 *    an empty list.
 *
 * Groups stay `tokens` and `pairs`, merged rather than nested per chain, so
 * `flattenSearchResults` and the keyboard highlight keep working untouched —
 * rendering one list and navigating another is the failure that makes Enter open
 * a different row than the cursor.
 */
export async function searchAllChains(
    q: string,
    limit: number = 15,
): Promise<AllChainSearchResult> {
    const trimmed = q.trim();
    if (trimmed === "") return { ...EMPTY_RESULT, chainsMissing: [], chainsUsed: [] };

    const chains = supportedChains.filter((name) => Boolean(PonderLinks[name]));
    const settled = await Promise.allSettled(
        chains.map((name) => fetchChainSearch(name, trimmed, limit)),
    );

    const tokens: SearchTokenResult[] = [];
    const pairs: SearchPairResult[] = [];
    const chainsMissing: string[] = [];
    const chainsUsed: string[] = [];

    settled.forEach((outcome, i) => {
        const name = chains[i];
        if (outcome.status === "fulfilled") {
            chainsUsed.push(name);
            tokens.push(...outcome.value.tokens);
            pairs.push(...outcome.value.pairs);
        } else {
            chainsMissing.push(name);
            console.warn(`searchAllChains: ${name} failed for "${trimmed}"`, outcome.reason);
        }
    });

    return { tokens, pairs, chainsMissing, chainsUsed };
}

