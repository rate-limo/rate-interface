"use client";

import { useSyncExternalStore } from "react";

/**
 * Markets this browser opened on Pro, most recent first, per network.
 *
 * The picker's Recent tab. At launchpad scale the picker no longer lists every
 * market, so the markets a trader reached by a pair link or a pasted address
 * have to be one click away the next time without searching again.
 *
 * Only pair ADDRESSES are stored: symbols are not unique on a venue where
 * anyone can mint a coin called PEPE, and the picker re-reads live rows by
 * address (`/api/pairs/ids`). Validated on the way out as well as in, since
 * localStorage is user-writable and these values reach a request.
 *
 * The key has a row in `/cookies`, as every storage key must.
 */
export const RECENT_MARKETS_KEY = "iter.recent-markets";
export const MAX_RECENT_MARKETS = 20;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
type Store = Record<string, string[]>;

export function parseRecentMarkets(raw: string | null): Store {
  if (!raw) return {};
  try {
    const decoded: unknown = JSON.parse(raw);
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return {};
    const out: Store = {};
    for (const [slug, ids] of Object.entries(decoded as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      out[slug] = ids.filter((id): id is string => typeof id === "string" && ADDRESS.test(id)).slice(0, MAX_RECENT_MARKETS);
    }
    return out;
  } catch {
    return {};
  }
}

/** Moves `pairId` to the front of `list`, de-duplicated case-insensitively. */
export function pushRecent(list: string[], pairId: string): string[] {
  const lower = pairId.toLowerCase();
  return [pairId, ...list.filter((id) => id.toLowerCase() !== lower)].slice(0, MAX_RECENT_MARKETS);
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; store: Store } = { raw: null, store: {} };

function read(): Store {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECENT_MARKETS_KEY);
  } catch {
    return cache.store;
  }
  if (raw !== cache.raw) cache = { raw, store: parseRecentMarkets(raw) };
  return cache.store;
}

export function recordRecentMarket(slug: string, pairId: string): void {
  if (!slug || !ADDRESS.test(pairId)) return;
  const store = read();
  const next = { ...store, [slug]: pushRecent(store[slug] ?? [], pairId) };
  try {
    window.localStorage.setItem(RECENT_MARKETS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: Recent simply stays empty. Nothing else depends on it.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_MARKETS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: string[] = [];

/** This network's recent markets. Empty on the server and on the first render. */
export function useRecentMarkets(slug: string): string[] {
  const store = useSyncExternalStore(subscribe, read, () => cache.store);
  return store[slug] ?? EMPTY;
}
