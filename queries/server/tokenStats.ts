"use server";
import { PonderLinks } from "@/consts";

/** The windows the stats panel offers; mirrors the gateway's WINDOW_SECONDS. */
export type StatsWindow = "5m" | "1h" | "6h" | "24h";

/**
 * Raw response of `GET /api/token/:address/stats/:window`.
 *
 * Every field is aggregated from `spotTrades` per request rather than read from a
 * column — see the route's own doc for why a "buy" is defined relative to THIS
 * token rather than to `isBid`, which describes the taker's direction against the
 * pair and therefore means the opposite thing on a quote-side token.
 *
 * Never throws. A failed stats read must not blank the token profile — same rule
 * as `getAccountProfile` — so a bad response degrades to `null` and the panel
 * renders its unavailable state.
 */
export interface TokenStatsResponse {
  token: string;
  window: StatsWindow;
  buys: number;
  sells: number;
  buyVolumeUSD: number;
  sellVolumeUSD: number;
  buyers: number;
  sellers: number;
  volumeUSD: number;
  trades: number;
  /** Null when the token never traded as the BASE in this window — unknown, not 0%. */
  priceChangePct: number | null;
  marketCapUSD: number | null;
  /** The all-time-high PRICE. Not comparable to marketCapUSD — see athMarketCapUSD. */
  athPriceUSD: number | null;
  /** That same peak expressed as a market cap (ath x totalSupply), which is what
   *  the MC bar compares against. Null when either input is unknown. */
  athMarketCapUSD: number | null;
  priceUSD: number | null;
}

export async function getTokenStats(
  networkName: string,
  address: string,
  window: StatsWindow,
): Promise<TokenStatsResponse | null> {
  const base = PonderLinks[networkName];
  if (!base || !address) return null;
  const url = `${base}/api/token/${encodeURIComponent(address)}/stats/${window}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getTokenStats: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as TokenStatsResponse;
  } catch (error) {
    console.warn(`getTokenStats: request failed for ${url}`, error);
    return null;
  }
}
