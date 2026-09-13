"use client";
import { useEffect, useRef, useState } from "react";
import { searchAllChains, SearchResult } from "@/queries/server/search";

const EMPTY_RESULT: SearchResult = { tokens: [], pairs: [] };
const DEBOUNCE_MS = 200;

type SearchFn = (networkName: string, q: string, limit?: number) => Promise<SearchResult>;

/**
 * Framework-independent debounce/fetch engine behind `useSearch`, factored
 * out of the hook so its behavior (rapid keystrokes collapsing into one
 * fetch, an empty query short-circuiting, a stale in-flight response never
 * clobbering a newer one) is unit-testable directly — this repo has no
 * React-hook-rendering test harness (no jsdom/testing-library), so a
 * rendered-hook test isn't an option here.
 */
export function createSearchEngine(
    fetchFn: SearchFn,
    onLoading: (loading: boolean) => void,
    onData: (result: SearchResult) => void,
    debounceMs: number = DEBOUNCE_MS,
) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestSeq = 0;

    function trigger(networkName: string, q: string, limit?: number) {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        const trimmed = q.trim();
        if (trimmed === "") {
            // Invalidate any in-flight request so its response can't land
            // after we've already cleared the results.
            requestSeq++;
            onLoading(false);
            onData(EMPTY_RESULT);
            return;
        }
        onLoading(true);
        const seq = ++requestSeq;
        timer = setTimeout(() => {
            fetchFn(networkName, trimmed, limit).then((result) => {
                if (seq === requestSeq) {
                    onData(result);
                    onLoading(false);
                }
            });
        }, debounceMs);
    }

    function cancel() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    return { trigger, cancel };
}

/**
 * Debounced token/pair search across EVERY served chain.
 *
 * It searched only the active chain, so a token on another network answered
 * "no results" — which reads as "does not exist" rather than "not here". That
 * is the same failure the modal replaced `ExploreSearch` to fix, one level up:
 * a search that cannot find a thing is indistinguishable from the thing being
 * absent.
 *
 * The debounce still collapses rapid keystrokes into ONE settled request, and
 * the fan-out rides it — so this is N gateway calls per settled keystroke, not
 * per keystroke.
 *
 * ## The network argument is gone, not ignored
 *
 * `createSearchEngine` keeps its `(networkName, q, limit)` fetch signature —
 * its tests pin it — so the fan-out is adapted at this call site rather than
 * threaded through. What matters is that `displayNetworkName` is no longer a
 * DEPENDENCY: keeping it would re-run an identical global search on every chain
 * switch, the same vestigial-parameter trap the leaderboard hook had.
 */
const ALL_CHAINS = "__all__";

export function useSearch(q: string, limit: number = 15) {
    const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
    const [chainsMissing, setChainsMissing] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const engineRef = useRef<ReturnType<typeof createSearchEngine> | null>(null);
    if (engineRef.current === null) {
        engineRef.current = createSearchEngine(
            async (_network, query, lim) => {
                const merged = await searchAllChains(query, lim);
                setChainsMissing(merged.chainsMissing);
                return { tokens: merged.tokens, pairs: merged.pairs };
            },
            setIsLoading,
            setResult,
        );
    }

    useEffect(() => {
        engineRef.current!.trigger(ALL_CHAINS, q, limit);
    }, [q, limit]);

    useEffect(() => {
        return () => engineRef.current?.cancel();
    }, []);

    return {
        tokens: result.tokens,
        pairs: result.pairs,
        /** Chains that failed this search. Non-empty means results are partial —
         *  a down gateway must not read as "no such token". */
        chainsMissing,
        isLoading,
    };
}
