"use server";
import { PonderLinks } from "@/consts";

import { GroupedOrderbookResult, SpotToken } from "@/types";

export async function getSpotOrderbook(networkName: string, base: SpotToken, quote: SpotToken, step: string, depth: number, isSingleSide: boolean) {
    let url;
    url = `${PonderLinks[networkName]}/api/orderbook/blocks/${base.id}/${quote.id}/${step}/${depth}/${isSingleSide}`;
    console.log(url, "url");
    const response = await fetch(url as string);
    const data = await response.json();
    return data as GroupedOrderbookResult;
}