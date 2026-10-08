import { applyFrame } from "@/lib/realtime/applyFrame";
import { gatewayFetch } from "@/lib/realtime/watermark";
import { PonderLinks } from "@/consts";
import { SpotBarEvent, SpotToken } from "@/types";
import { eventBus } from "@/utils/events";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";


export const useToken = (
    networkName: string,
    symbol: string,
) => {
    const queryClient = useQueryClient();
    async function getToken() {
        // `/api/token/:address` parses its parameter with viem's getAddress,
        // so passing a SYMBOL there threw — the gateway answered 500 for
        // `/api/token/ETH`. `/token/symbol/:symbol` is the route that takes
        // what this hook actually holds. (The gateway now returns 400 rather
        // than 500 for the mistake; this stops making it.)
        const url = `${PonderLinks[networkName]}/api/token/symbol/${encodeURIComponent(symbol)}`;
        
        const response = await gatewayFetch(url as string);
        const data = await response.json();
        return data;
    }

    const { data, isLoading, error } = useQuery({
        queryKey: ['token', networkName, symbol],
        queryFn: () => getToken(),
    })

    // Set up event listener
    useEffect(() => {

        const handleTokenUpdate: (token: SpotToken, event: SpotBarEvent) => SpotToken = (token: SpotToken, event: SpotBarEvent) => {
            return {
                ...token,
                priceUSD: event.price,
                ath: token.ath > event.price ? token.ath : event.price,
                atl: token.atl < event.price ? token.atl : event.price,
                marketCap: event.price * token.totalSupply,
                dayPriceDifference: event.price - token.priceUSD1DayBF,
                dayPriceDifferencePercentage: (event.price - token.priceUSD1DayBF) / token.priceUSD1DayBF * 100,
            }
        }
        const handleTradeUpdate = (event: SpotBarEvent) => {
            const [symbol, interval] = event.id.split("-");
            void applyFrame(queryClient, ['token', networkName, symbol], (oldData: SpotToken) => {
                let changedToken = handleTokenUpdate(oldData, event);
                return changedToken;
            })

        }

        eventBus.on("spot-token-price-update", handleTradeUpdate)

        return () => {
            eventBus.off("spot-token-price-update", handleTradeUpdate)
        }
    }, [])

    return {
        data: data ?? {} as SpotToken,
        isLoading,
        error
    }
}