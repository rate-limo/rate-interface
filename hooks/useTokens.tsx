import { PonderLinks } from "@/consts";
import { SpotBarEvent, SpotToken } from "@/types";
import { eventBus } from "@/utils/events";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export type SpotTokenData = {
    tokens: SpotToken[];
    totalCount: number;
    totalPages: number;
    pageSize: number;
}

/** Ranking routes the gateway serves. "" is the default (by id). */
export type TokenRanking =
    | ""
    | "top-gainer"
    | "top-loser"
    | "new"
    | "oldest"
    | "top-volume"
    | "top-marketcap"
    | "trending";

/** The axis that is NOT the ranking. Listed and launched are orthogonal — a launch that
 * graduates is both — so this is a filter alongside the sort, not a separate list. */
export type TokenSource = "listed" | "launched" | "all";

export const useTokens = (
    networkName: string,
    pageSize: number = 20,
    page: number = 1,
    options: TokenRanking | string = "",
    source: TokenSource = "listed",
) => {
    const queryClient = useQueryClient();
    async function getTokens() {
        // Every ranking is a path segment; only "" has none. Building it this way keeps a
        // new ranking to one line here and one route in the gateway.
        const segment = options === "" ? "" : `${options}/`;
        // Launches are an explicit discovery surface and must include tokens
        // before they graduate; the gateway's `launched` source is unlisted-safe.
        const query = source === "listed" ? "" : `?source=${source}`;
        const url = `${PonderLinks[networkName]}/api/tokens/${segment}${pageSize}/${page}${query}`;
        const response = await fetch(url as string);
        const data = await response.json();
        return data as SpotTokenData;
    }

    const { data, isLoading, error } = useQuery({
        queryKey: ['tokens', networkName, pageSize, page, options, source],
        queryFn: () => getTokens(),
        enabled: !!networkName,
    })


    // Set up event listener
    useEffect(() => {

        const handleTokenUpdate: (token: SpotToken, event: SpotBarEvent) => SpotToken = (token: SpotToken, event: SpotBarEvent) => {
            return {
                ...token,
                priceUSD: event.price,
                ath: token.ath > event.price ? token.ath : event.price,
                atl: token.atl < event.price ? token.atl : event.price,
                // marketCap is served by the indexer (a generated column on
                // spotTokens), so this is not a second source of truth — it is
                // the same expression applied to the tick that just moved
                // priceUSD, keeping the cached row consistent until the next
                // refetch. Leaving it stale would show a cap that disagrees with
                // the price rendered beside it.
                marketCap: event.price * token.totalSupply,
                dayPriceDifference: event.price - token.priceUSD1DayBF,
                dayPriceDifferencePercentage: (event.price - token.priceUSD1DayBF) / token.priceUSD1DayBF * 100,
            }
        }
        const handleTradeUpdate = (event: SpotBarEvent) => {
            const [symbol, interval] = event.id.split("-");
            queryClient.setQueryData(['tokens', options, networkName], (oldData: SpotTokenData) => {
                // find the changed token and update it
                let changedToken = oldData.tokens.find(token => token.symbol === symbol);
                if (changedToken) {
                    changedToken = handleTokenUpdate(changedToken, event);
                } else {
                    return oldData;
                }
                // replace the old token into the new token
                oldData.tokens = oldData.tokens.map(token => token.symbol === changedToken.symbol ? changedToken : token);

                if (options === "top-gainer") {
                    // sort the SpotToken array based on the dayPriceDifferencePercentage
                    oldData.tokens = oldData.tokens.sort((a, b) => b.dayPriceDifferencePercentage - a.dayPriceDifferencePercentage);
                } else if (options === "top-loser") {
                    // sort the SpotToken array based on the dayPriceDifferencePercentage
                    oldData.tokens = oldData.tokens.sort((a, b) => a.dayPriceDifferencePercentage - b.dayPriceDifferencePercentage);
                } else if (options === "top-volume") {
                    // sort the SpotToken array based on the dayVolume
                    oldData.tokens = oldData.tokens.sort((a, b) => b.dayVolume - a.dayVolume);
                } else if (options === "new") {
                    // sort the SpotToken array based on the listingDate
                    oldData.tokens = oldData.tokens.sort((a, b) => b.listingDate - a.listingDate);
                }

                return {
                    ...oldData,
                    tokens: oldData.tokens
                }
            })

        }

        eventBus.on("spot-token-price-update", handleTradeUpdate)

        return () => {
            eventBus.off("spot-token-price-update", handleTradeUpdate)
        }
    }, [])

    return {
        data: data ?? {
            tokens: [],
            totalCount: 0,
            totalPages: 0,
            pageSize: 0
        } as SpotTokenData,
        isLoading,
        error
    }
}

/** Token-directory pagination: fetches bounded pages and lets the table append them on demand. */
export const useInfiniteTokens = (
    networkName: string,
    pageSize: number = 200,
    options: TokenRanking | string = "",
    source: TokenSource = "listed",
) => {
    const segment = options === "" ? "" : `${options}/`;
    const query = source === "listed" ? "" : `?source=${source}`;
    return useInfiniteQuery<SpotTokenData>({
        queryKey: ["tokens-infinite", networkName, pageSize, options, source],
        enabled: !!networkName,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const url = `${PonderLinks[networkName]}/api/tokens/${segment}${pageSize}/${pageParam}${query}`;
            const response = await fetch(url as string);
            if (!response.ok) throw new Error(`Token request failed: ${response.status}`);
            return response.json() as Promise<SpotTokenData>;
        },
        getNextPageParam: (lastPage, pages) => {
            const next = pages.length + 1;
            return next <= lastPage.totalPages ? next : undefined;
        },
    });
};
