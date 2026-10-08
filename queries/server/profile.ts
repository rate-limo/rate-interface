"use server";
import { PonderLinks } from "@/consts";

/**
 * The public profile page's reads, all against the gateway.
 *
 * Same conventions as `queries/server/account.ts`, for the same reasons:
 * `Record<string, unknown>` at this layer because normalisation belongs to the
 * pure modules under `lib/profile` (which are unit-testable in a way a server
 * action is not), and **nothing here throws** — one failed panel must cost its
 * own tab's rows and nothing else on the page.
 */

async function getJson(url: string, label: string): Promise<Record<string, unknown> | null> {
  try {
    // `revalidate: 0` throughout: every one of these is per-wallet, and a
    // cached answer here is one wallet's data served to whoever asks next —
    // the same reasoning `getAccountPositions` spells out.
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`${label}: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    console.warn(`${label}: request failed for ${url}`, error);
    return null;
  }
}

function base(networkName: string): string | null {
  return PonderLinks[networkName] ?? null;
}

/** Coins a wallet raised for through `PresaleLaunch`. The auction half of the
 * Coins tab; `getCreatorTokens` in `./tokens` is the launch half. */
export async function getCreatorAuctions(
  networkName: string,
  address: string,
  pageSize: number,
  page: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/auctions/creator/${encodeURIComponent(address)}/${pageSize}/${page}`,
    "getCreatorAuctions",
  );
}

/**
 * A wallet's LP positions, from `broker.bandPositions`.
 *
 * The Rewards tab used to derive its list from `getCreatorAuctions` above, which
 * could only ever surface a GRADUATED AUCTION's position — so every position an
 * ordinary launch created was structurally invisible. Measured on Arc, wallet
 * 0x9E7A…850E: no auctions at all, and four live LP positions.
 *
 * This is the same ledger `/leaderboard/lps` ranks on, filtered to one wallet
 * and left un-aggregated, because a claim is made against an individual
 * position's `tokenId`.
 */
export async function getAccountLpPositions(
  networkName: string,
  address: string,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/account/${encodeURIComponent(address)}/lp-positions`,
    "getAccountLpPositions",
  );
}

/** A wallet's posts, newest first. */
export async function getAuthorTheses(
  networkName: string,
  address: string,
  pageSize: number,
  page: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/theses/author/${encodeURIComponent(address)}/${pageSize}/${page}`,
    "getAuthorTheses",
  );
}

/**
 * Every author's posts, newest first — the home page's Callouts tab.
 *
 * Kept beside `getAuthorTheses` rather than in a file of its own: the three
 * theses reads share a response shape (the gateway serves them from one
 * projection, see `apps/gateway/src/api/theses.ts`), and splitting them across
 * modules is how two callers end up parsing the same payload differently.
 */
export async function getThesesFeed(
  networkName: string,
  pageSize: number,
  page: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root) return null;
  return getJson(`${root}/api/theses/feed/${pageSize}/${page}`, "getThesesFeed");
}

/**
 * Names and avatars for a list of wallets, in one request.
 *
 * The addresses ride in a query string rather than a POST body because this is a
 * read and the gateway caches reads by URL — and because a sorted, deduplicated
 * list makes the URL itself the cache key, so a tape that re-renders on every
 * fill re-asks for nothing.
 */
/**
 * ABSOLUTE, straight at the gateway — and it must stay that way.
 *
 * **This file is `"use server"` (line 1), so every export here is a Server
 * Action.** A client component calling one does not make the request itself: it
 * POSTs to the action and the `fetch` below runs on the SERVER. A relative URL
 * has no origin to resolve against there, so `fetch` throws
 * `TypeError: Failed to parse URL` — which `getJson` swallows into `null`,
 * which `useIdentities` turns into an empty map by design, which leaves every
 * wallet in the app rendering as a truncated address with nothing on screen or
 * in the browser's network tab to say why.
 *
 * That is exactly what happened between c3fe4b9b and this commit. The reasoning
 * that moved it — "its only caller is a client component, so the browser makes
 * the request, so the gateway's origin allowlist applies" — is true of
 * `fetchProfile` in `lib/portfolio/profile.ts`, which carries no `"use server"`
 * and genuinely does run in the browser. It is false here, and the two
 * functions therefore need OPPOSITE URLs. Measured on the dev server: 108
 * `getIdentities: request failed … Failed to parse URL` lines, one per render.
 *
 * The CORS allowlist never applied to this call. A server-to-server request
 * carries no browser `Origin`, which is the same reason `app/api/gateway/[...path]`
 * can proxy for the browser at all.
 */
export async function getIdentities(
  networkName: string,
  addresses: readonly string[],
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || addresses.length === 0) return null;
  const list = encodeURIComponent(addresses.join(","));
  return getJson(`${root}/api/identities?addresses=${list}`, "getIdentities");
}

/**
 * Every callout about one coin, newest first — the token profile's Callouts tab.
 *
 * A separate route rather than a filter on the feed above: the gateway already
 * indexes `theses.tokenAddress` (the chart marks read it), so scoping server-side
 * is one predicate, while filtering a paged global river client-side would drop
 * whole pages of a quiet coin's callouts and report the wrong total.
 */
export async function getTokenTheses(
  networkName: string,
  address: string,
  pageSize: number,
  page: number,
  /** Narrow to one wallet's callouts on this coin — the modal's thread. */
  author?: string,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  const query = author ? `?author=${encodeURIComponent(author)}` : "";
  return getJson(
    `${root}/api/theses/token/${encodeURIComponent(address)}/${pageSize}/${page}${query}`,
    "getTokenTheses",
  );
}

/**
 * Posts by the wallets `address` follows — the Friends tab.
 *
 * Returns an empty feed for a wallet that follows nobody, and deliberately does
 * NOT fall back to the global river: strangers under a tab labelled Friends
 * would teach people the follow graph does something it does not.
 */
export async function getFollowingTheses(
  networkName: string,
  address: string,
  pageSize: number,
  page: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/theses/following/${encodeURIComponent(address)}/${pageSize}/${page}`,
    "getFollowingTheses",
  );
}

/** Followers or following, paginated. */
export async function getFollowList(
  networkName: string,
  address: string,
  direction: "followers" | "following",
  page: number,
  pageSize: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/account/${encodeURIComponent(address)}/${direction}?page=${page}&pageSize=${pageSize}`,
    "getFollowList",
  );
}

/**
 * The recorded USD balance series — one point per UTC day.
 *
 * `days` is the only difference between the 1D, 1W and 1M timeframes; the table
 * is keyed `(account, index)` with a row per day, so all three are one query at
 * different widths rather than three features.
 */
export async function getBalanceHistory(
  networkName: string,
  address: string,
  days: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/account/${encodeURIComponent(address)}/balance-history?days=${days}`,
    "getBalanceHistory",
  );
}

/**
 * The account profile, optionally scoped to a viewer.
 *
 * Distinct from `getAccountProfile` in `./account` only by `?viewer=`, which
 * makes the response carry `social.viewerFollows`. Passing it means the Follow
 * button paints in its final state on first render instead of mounting as
 * "Follow" and flipping — which reads as the page undoing the user's own action.
 */
export async function getAccountProfileForViewer(
  networkName: string,
  address: string,
  viewer: string | undefined,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
  return getJson(`${root}/api/account/${encodeURIComponent(address)}${query}`, "getAccountProfileForViewer");
}

/**
 * Where this wallet stands on the realised-PnL board — `{ rank, totalCount }`.
 *
 * Its own read rather than a field on `getAccountProfileForViewer`, because rank
 * is a property of every wallet on the venue and the profile route is a property
 * of one. Folding it in would make the common read pay for an aggregate over the
 * whole fill ledger on every profile view.
 *
 * `rank` comes back null for a wallet the fill ledger has never seen. That is
 * "unranked", not "last", and callers must render it as an absence — see the
 * gateway route's own note.
 */
export async function getPnlRank(
  networkName: string,
  address: string,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/leaderboard/pnl/rank/${encodeURIComponent(address)}`,
    "getPnlRank",
  );
}

/**
 * Realised PnL over time — the series the card actually draws.
 *
 * Distinct from `getBalanceHistory` in what can produce it. That one is the
 * wallet's own signed statement of what it holds, so it exists only for wallets
 * that paid a signature to record it — on this venue, one row across every
 * account. This is folded from the fill ledger server-side, so every wallet that
 * has traded has one.
 *
 * The response carries `matchesLedger`: the gateway replays the broker's own
 * `applyBuy`/`applySell` and compares the result against the stored
 * `spotPositions.realizedPnlUSD`. Callers must not draw a series that says
 * false — a re-derivation that disagrees with the ledger is exactly the
 * plausible-wrong-number failure the shared module exists to prevent.
 */
export async function getPnlHistory(
  networkName: string,
  address: string,
  days: number,
): Promise<Record<string, unknown> | null> {
  const root = base(networkName);
  if (!root || !address) return null;
  return getJson(
    `${root}/api/account/${encodeURIComponent(address)}/pnl-history?days=${days}`,
    "getPnlHistory",
  );
}
