import { gatewayFetch } from "@/lib/realtime/watermark";
import { SpotPair } from "@/types";
import { useQuery } from "@tanstack/react-query";


export type SpotPairData = {
    pairs: SpotPair[];
    totalCount: number;
    totalPages: number;
    pageSize: number;
}

export const usePairs = (
    networkName: string,
    pageSize: number = 20,
    page: number = 1,
    options: string = "",
) => {

    async function getPairs() {
        let path;
        if (options === "") {
            path = `pairs/${pageSize}/${page}`;
        } else if (options === "top-gainer") {
            path = `pairs/top-gainer/${pageSize}/${page}`;
        } else if (options === "top-loser") {
            path = `pairs/top-loser/${pageSize}/${page}`;
        } else if (options === "new") {
            path = `pairs/new/${pageSize}/${page}`;
        } else if (options === "unlisted") {
            // Pre-graduation markets. Its own gateway route rather than a flag
            // on the ones above — see apps/gateway/src/api/visibility.ts. These
            // are never mixed into a ranking; Explore shows them in the
            // Launches tab, behind a warning.
            path = `pairs/unlisted/${pageSize}/${page}`;
        }
        if (!path) throw new Error(`Unsupported pair query: ${options}`);
        const network = encodeURIComponent(networkName);
        const response = await gatewayFetch(`/api/gateway/${path}?network=${network}`);
        if (!response.ok) throw new Error(`Could not load pairs (${response.status})`);
        return await response.json();
    }

    const { data, isLoading, error } = useQuery({
        queryKey: ['pairs', options, networkName, pageSize, page],
        queryFn: () => getPairs(),
        staleTime: 6000,
    })

    return {
        data: error ? {
            pairs: [],
            totalCount: 0,
            totalPages: 0,
            pageSize: 0
        } as SpotPairData : (data ?? {
            pairs: [],
            totalCount: 0,
            totalPages: 0,
            pageSize: 0
        } as SpotPairData),
        isLoading,
        error
    }
}
