"use client";

/**
 * Starring and unstarring, against identity-service.
 *
 * Both verbs are idempotent server-side, so a double tap is not an error and the
 * caller's optimistic update is never rolled back by one.
 *
 * `symbol` (and base/quote) ride along as DISPLAY LABELS only. identity-service
 * cannot read `spotPairs`/`spotTokens` — those are per-chain — so without them a
 * watchlist row could not be rendered from the identity database alone. They are
 * never the source of truth for anything live.
 */

type PairLabels = { symbol?: string; base?: string; quote?: string };

async function send(path: string, method: "PUT" | "DELETE", body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    // The wallet proof is an httpOnly cookie; without this the write is anonymous
    // and answers 401.
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Watchlist update failed (${res.status})`);
  }
}

export const addToSpotPairWatchlistClient = (pair: string, labels: PairLabels = {}) =>
  send(`/wallet/watchlist/pair/${encodeURIComponent(pair)}`, "PUT", labels);

export const removeFromSpotPairWatchlistClient = (pair: string) =>
  send(`/wallet/watchlist/pair/${encodeURIComponent(pair)}`, "DELETE");

export const addToTokenWatchlistClient = (tokenId: string, symbol?: string) =>
  send(`/wallet/watchlist/token/${encodeURIComponent(tokenId)}`, "PUT", { symbol });

export const removeFromTokenWatchlistClient = (tokenId: string) =>
  send(`/wallet/watchlist/token/${encodeURIComponent(tokenId)}`, "DELETE");
