/**
 * The "Coins" tab's row model: one list, two origins.
 *
 * A wallet reaches a market by one of two contracts, and a profile that showed
 * only one silently omits real coins:
 *
 *  - **`AssetGenerator`** lists immediately. Served by
 *    `GET /api/tokens/creator/:address/:pageSize/:page`.
 *  - **`PresaleLaunch`** runs a fixed-price pro-rata sale that graduates into a
 *    market. Served by `GET /auctions/creator/:address/:pageSize/:page`.
 *
 * Neither is a superset of the other, so both are read and normalised here. The
 * mapping is pure — this repo's vitest runs in the node environment and cannot
 * render a hook, so the mapping is the thing that gets tested, the same reason
 * `composePairSnapshot` and `toCreatorTokens` are factored out of their callers.
 *
 * ## Three columns, and why the origin is not a fourth
 *
 * The spec is Coin / MC / Age. `origin` rides INSIDE the coin cell as a chip
 * rather than claiming a column of its own: it is an attribute of the coin's
 * identity, not a measure to scan down, and a fourth column at 550px costs the
 * name the width it needs to be readable.
 */

import { formatMarketCap } from "@/utils/number";

export type CoinOrigin = "launch" | "auction";

export interface CreatedCoinRow {
  /** Checksummed ERC-20 address — the row's identity and its link target. */
  address: string;
  name: string;
  symbol: string;
  logoURI: string | null;
  /** Which contract minted it. Rendered as a chip beside the ticker. */
  origin: CoinOrigin;
  /**
   * Straight from `spotTokens.marketCap`, a STORED generated column — so this
   * can never disagree with what the token tables print. Null when the coin has
   * no price yet.
   */
  marketCapUsd: number | null;
  /** Unix seconds the coin was listed/created. Null when unknown. */
  createdAt: number | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A launch row, from the creator-tokens route. */
export function toLaunchRow(token: Record<string, unknown>): CreatedCoinRow {
  const symbol = String(token.symbol ?? "?");
  return {
    address: String(token.id ?? ""),
    name: String(token.name ?? symbol),
    symbol,
    logoURI: optionalString(token.logoURI),
    origin: "launch",
    marketCapUsd: optionalFinite(token.marketCap),
    createdAt: optionalFinite(token.listingDate),
  };
}

/** An auction row, from the creator-auctions route. */
export function toAuctionRow(campaign: Record<string, unknown>): CreatedCoinRow {
  const symbol = String(campaign.symbol ?? "?");
  return {
    address: String(campaign.coin ?? ""),
    name: String(campaign.name ?? symbol),
    symbol,
    logoURI: optionalString(campaign.logoURI),
    origin: "auction",
    marketCapUsd: optionalFinite(campaign.marketCap),
    createdAt: optionalFinite(campaign.createdAt),
  };
}

/**
 * Merge the two sources into one page, newest first.
 *
 * ## Why the merge is client-side, and what that costs
 *
 * The two routes page independently, so page 2 of each is not page 2 of the
 * union — this sorts and slices what it was given. That is honest for the first
 * page and increasingly approximate after it, which is acceptable because a
 * creator's list is short (the overwhelmingly common case is under ten coins,
 * fitting on page one) and the alternative is a UNION view across a `broker`
 * and an `admin` table, which is a schema change rather than a route.
 *
 * If a creator ever has enough coins for this to matter, the fix is a single
 * server-side route that unions them — not deeper client-side paging, which
 * would keep this approximation and hide it better.
 *
 * A row with no `createdAt` sorts LAST rather than as epoch 0, matching the rule
 * `presaleCampaigns.lastCommittedAt` states for its own null ordering.
 */
export function mergeCreatedCoins(
  launches: CreatedCoinRow[],
  auctions: CreatedCoinRow[],
): CreatedCoinRow[] {
  return [...launches, ...auctions].sort((a, b) => {
    if (a.createdAt === null && b.createdAt === null) return 0;
    if (a.createdAt === null) return 1;
    if (b.createdAt === null) return -1;
    return b.createdAt - a.createdAt;
  });
}

/** Market cap for the MC column. `$4.1m` — the same formatter the token tables
 * use, re-exported rather than reimplemented so the two cannot drift. An
 * unpriced coin renders an em-dash, never `$0`. */
export { formatMarketCap };

/**
 * Age for the third column: `19d ago`, `1mo ago`, `2y ago`.
 *
 * Coarser than `live.ts`'s `ageFrom` (`m`/`h`/`d`) on purpose — that one labels
 * a freshly launched token where minutes matter; this one labels a creator's
 * back catalogue, where "1mo ago" is more useful than "34d". Both round DOWN,
 * so a coin never claims to be older than it is.
 *
 * `nowSeconds` is a parameter rather than a `Date.now()` call so the boundaries
 * are testable without freezing the clock.
 */
export function formatAge(createdAt: number | null, nowSeconds: number): string {
  if (createdAt === null || !Number.isFinite(createdAt) || createdAt <= 0) return "—";
  const seconds = Math.max(0, Math.floor(nowSeconds - createdAt));

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(seconds / 3_600);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(seconds / 86_400);
  if (days < 30) return `${days}d ago`;
  // 30-day months and 365-day years: this is a human-readable age, not a
  // calendar difference, and a caller doing date arithmetic on it would be
  // using the wrong value regardless.
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
