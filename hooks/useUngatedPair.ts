"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";

import { useQuery } from "@tanstack/react-query";
import type { SpotPair } from "@/types";

/**
 * One market, read from the gateway's UNGATED `/api/pair/symbol/:base/:quote`.
 *
 * ## Why the deposit flow needs this
 *
 * `LiquidityFlow` took its rate from `defaultSpotPairData` — the first twenty
 * LISTED pairs. A pair nobody has provided to yet is unlisted by construction,
 * so the rate resolved to 0 on exactly the markets that most need a deposit:
 * the card read "This band accepts 1 VFCBER : 0 USDC", and because the paired
 * fields clear the other side when there is no anchor, typing a base amount
 * emptied the quote and typing a quote emptied the base. A two-sided deposit
 * into a new pair could not be entered at all.
 *
 * Same failure `PairProfile` had and `app/[locale]/pair/page.tsx` records: a
 * gated read behind an ungated link. The token picker lists unlisted markets
 * (`/api/gateway/swap/tokens` merges `/api/pairs/unlisted`), so the flow offers
 * the pair and then cannot price it.
 *
 * ## Either order
 *
 * The gateway keys on (base, quote) and 404s the inverse. A flipped pair is the
 * same market inverted, so both are tried and the row comes back as the gateway
 * holds it — `resolveRate` already inverts the price.
 */
export type UngatedPair = SpotPair;

type Fetcher = (url: string) => Promise<Response>;

async function readPair(url: string, fetcher: Fetcher): Promise<UngatedPair | null> {
  const response = await fetcher(url);
  if (!response.ok) return null;
  const body = (await response.json()) as Partial<UngatedPair> | null;
  // `{"error":"Token not found"}` has been served with a 200 before. A row that
  // names no market is not one.
  return body?.symbol && body.base?.symbol && body.quote?.symbol ? (body as UngatedPair) : null;
}

export async function fetchPairEitherOrder(
  networkName: string,
  base: string,
  quote: string,
  fetcher: Fetcher = (url) => gatewayFetch(url),
): Promise<UngatedPair | null> {
  const network = encodeURIComponent(networkName);
  const url = (b: string, q: string) =>
    `/api/gateway/pair/symbol/${encodeURIComponent(b)}/${encodeURIComponent(q)}?network=${network}`;
  return (await readPair(url(base, quote), fetcher)) ?? (await readPair(url(quote, base), fetcher));
}

export function useUngatedPair(networkName: string, base: string, quote: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ungated-pair", networkName, base, quote],
    enabled: enabled && Boolean(networkName && base && quote),
    queryFn: () => fetchPairEitherOrder(networkName, base, quote),
    staleTime: 15_000,
  });
}
