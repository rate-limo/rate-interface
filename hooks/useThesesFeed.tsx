"use client";
import { useQuery } from "@tanstack/react-query";
import {
  getAuthorTheses,
  getFollowingTheses,
  getThesesFeed,
  getTokenTheses,
} from "@/queries/server/profile";

/**
 * One post in a callout feed, as the gateway's shared projection serves it
 * (`apps/gateway/src/api/theses.ts` — all three feeds select the same columns,
 * so one type covers author, global and following).
 */
export interface FeedThesis {
  id: number;
  author: string;
  tokenAddress: string;
  pair: string;
  /** uint64 as a string — it exceeds Number.MAX_SAFE_INTEGER. */
  tradeId: string;
  plotTime: number;
  plotPrice: number;
  /** USD size of the trade the post is anchored to. The stake behind the claim. */
  valueUsd: number;
  body: string;
  createdAt: string;
  /** From the spotTokens join; null for a token the broker has never seen. */
  symbol: string | null;
  name: string | null;
  logoURI: string | null;
  /**
   * The author's profile, from the `accountProfiles` LEFT join.
   *
   * All three are null for an unclaimed wallet, which is the ordinary case —
   * rows are generated lazily — so a card must fall back to the address rather
   * than treat a null as a failure. Same table the traders panel reads, so one
   * wallet cannot appear under two different names on the same page.
   */
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
}

/**
 * Which river to read.
 *
 * Three of the four need a subject address and they do NOT mean the same
 * subject. `following` reads the posts of the wallets the VIEWER follows (the
 * Friends tab); `author` reads one wallet's own posts (the Replies tab on a
 * profile), where the subject is whose page you are on rather than who you are;
 * `token` reads every callout about one COIN (the token profile's Callouts
 * tab), where the subject is a contract address and no wallet is involved at
 * all. `subject` is named for that — it was `viewer`, which is true for exactly
 * one of the four.
 *
 * One hook covers all of them because the gateway serves them from a single
 * projection — see `apps/gateway/src/api/theses.ts`. Splitting them would be
 * four places to parse one payload shape.
 */
export type FeedScope = "all" | "following" | "author" | "token";

/**
 * The home page's callout feed.
 *
 * `following` is disabled rather than falling back to `all` when no wallet is
 * connected: an empty Friends tab is the honest state for a visitor who has not
 * connected, and quietly serving the global river under that label would teach
 * people the follow graph does something it does not.
 *
 * Rows are `null` on failure and `[]` on an empty feed — kept apart so the
 * component can tell "nothing posted yet" from "the read failed", the same
 * distinction `useLeaderboard` draws.
 */
export function useThesesFeed({
  networkName,
  scope,
  subject,
  author,
  pageSize = 20,
  page = 1,
}: {
  networkName: string;
  scope: FeedScope;
  /**
   * The address the scope is about. For `following` that is the VIEWER, whose
   * follow graph is read; for `author` it is the wallet whose profile is open;
   * for `token` it is the COIN. Ignored by `all`.
   */
  subject?: string;
  /**
   * `token` scope only: narrow to one wallet's callouts on that coin.
   *
   * Which is the callout modal's thread. Sent to the route rather than applied
   * to the answer, because the route pages: filtering here would drop an
   * author's posts off page one on a busy coin and show an empty thread under
   * the post it was opened from.
   */
  author?: string;
  pageSize?: number;
  page?: number;
}) {
  const enabled = !!networkName && (scope === "all" || !!subject);

  const { data, isLoading, error } = useQuery({
    queryKey: ["theses-feed", networkName, scope, subject ?? null, author ?? null, pageSize, page],
    enabled,
    queryFn: async () => {
      const raw =
        scope === "following"
          ? await getFollowingTheses(networkName, subject!, pageSize, page)
          : scope === "author"
            ? await getAuthorTheses(networkName, subject!, pageSize, page)
            : scope === "token"
              ? await getTokenTheses(networkName, subject!, pageSize, page, author)
              : await getThesesFeed(networkName, pageSize, page);
      if (!raw) return null;
      const rows = (raw.theses as FeedThesis[] | undefined) ?? [];
      return { rows, totalCount: Number(raw.totalCount ?? 0) };
    },
  });

  return {
    rows: data?.rows ?? [],
    /** True only when the read actually failed — not when the feed is empty. */
    failed: data === null,
    totalCount: data?.totalCount ?? 0,
    isLoading: enabled && isLoading,
    /** Friends with no wallet connected: nothing to read, and not an error.
     * `author` never needs one — the subject comes from the URL, so a
     * logged-out visitor reads a profile's posts fine. */
    needsWallet: scope === "following" && !subject,
    error,
  };
}
