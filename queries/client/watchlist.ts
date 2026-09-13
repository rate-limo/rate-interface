"use client";

/**
 * The watchlist, read from identity-service.
 *
 * Was `localStorage` until 2026-09-02, which meant a starred pair existed on one
 * browser and nowhere else — `spotPairLikes`/`spotTokenLikes` had been in the
 * schema the whole time with nothing ever writing them.
 *
 * Keyed by ID, not symbol. Symbols are not unique on a venue where anyone can
 * mint a coin called USDC, and keying on one would let a counterfeit take a real
 * token's place in somebody's watchlist.
 *
 * Both lists arrive in ONE response: the same screens render pair stars and
 * token stars, and two round trips would show a flash of unstarred stars while
 * the second landed.
 */

export interface WatchlistResponse {
  address: string | null;
  pairs: { pair: string; symbol: string | null; base: string | null; quote: string | null }[];
  tokens: { tokenId: string; symbol: string | null }[];
}

const EMPTY: WatchlistResponse = { address: null, pairs: [], tokens: [] };

/**
 * `credentials: "include"` is required and easy to forget: the wallet proof is
 * an httpOnly cookie, and a fetch without it is indistinguishable from a
 * signed-out visitor — an empty watchlist with a 200, which reads as "you have
 * starred nothing" rather than as an error.
 */
export async function getWatchlistClient(): Promise<WatchlistResponse> {
  const res = await fetch("/wallet/watchlist", { credentials: "include" });
  if (!res.ok) return EMPTY;
  const body = (await res.json().catch(() => null)) as WatchlistResponse | null;
  if (!body || !Array.isArray(body.pairs) || !Array.isArray(body.tokens)) return EMPTY;
  return body;
}

export async function getSpotPairWatchlistClient(): Promise<string[]> {
  return (await getWatchlistClient()).pairs.map((p) => p.pair);
}

export async function getTokenWatchlistClient(): Promise<string[]> {
  return (await getWatchlistClient()).tokens.map((t) => t.tokenId);
}
