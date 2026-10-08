"use server";
import { PonderLinks } from "@/consts";

import { GroupedOrderbookResult, SpotToken } from "@/types";

/**
 * The REST orderbook, read on mount and on every socket reconnect.
 *
 * It returns NULL on any failure, and the caller renders an empty book rather
 * than trusting whatever came back. Before this it did none of that: no
 * `response.ok`, no try/catch, and an unchecked cast — so a non-2xx answer
 * (unlisted pair, bad step, a gateway hiccup) handed `{error: "..."}` back cast
 * as a `GroupedOrderbookResult`, whose `bids`/`asks` are then undefined. The
 * page rendered dashes with a 200-shaped object behind them and no signal
 * anywhere — the same "wrong UI, zero diagnostics" shape as the token header's
 * swallowed poll.
 *
 * `null` rather than a throw because this runs on resync: a reconnect that
 * throws unmounts the book the user is reading, while a null leaves the last
 * frame up until the socket delivers the next one.
 */
export async function getSpotOrderbook(
  networkName: string,
  base: SpotToken,
  quote: SpotToken,
  step: string,
  depth: number,
  isSingleSide: boolean,
): Promise<GroupedOrderbookResult | null> {
  const root = PonderLinks[networkName];
  if (!root) return null;
  const url = `${root}/api/orderbook/blocks/${base.id}/${quote.id}/${step}/${depth}/${isSingleSide}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getSpotOrderbook: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as GroupedOrderbookResult;
  } catch (error) {
    console.warn(`getSpotOrderbook: request failed for ${url}`, error);
    return null;
  }
}
