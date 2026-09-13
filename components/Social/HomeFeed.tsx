"use client";

import { useMemo, useState } from "react";
import { useRequireWallet } from "@/lib/wallet/connectGate";
import { toast } from "sonner";
import Link from "next/link";
import { Star } from "lucide-react";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { slugToNetworkName } from "@/consts";
import { money, TokenAvatar } from "@/components/Portfolio/parts";
import { useTokens, type TokenRanking } from "@/hooks/useTokens";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useThesesFeed, type FeedScope } from "@/hooks/useThesesFeed";
import { CalloutCard } from "./CalloutCard";
import { GetStartedCard } from "@/components/Onboarding/GetStartedCard";
import { ChainOnboardingStack } from "@/components/Onboarding/ChainOnboardingStack";
import { ExploreIter } from "@/components/Onboarding/ExploreIter";

/**
 * The centre column of `/home` — the social river.
 *
 * ## Two tab rows are two different questions
 *
 * Row one picks WHOSE activity (Callouts, Friends, Top); row two picks WHAT is
 * ranked (Trending, Movers, Watchlist). They are independent axes rather than
 * six variants of one list, which is why row two disables itself under the two
 * people-shaped tabs: "Trending" has no meaning applied to a reverse-chronological
 * feed of posts, and rendering it as if it did would be a lie about what the
 * control does.
 *
 * ## What is real here
 *
 * Callouts, Friends, Trending and Movers are all served. Watchlist is
 * `localStorage`, per-browser and keyed on symbol — `useWatchlist` has worked
 * this way since before this page existed. That is worth stating plainly in the
 * empty state rather than implying it follows the wallet: it does not sync
 * across devices, and there is no server-side watchlist table.
 */

type PeopleTab = "callouts" | "friends" | "top";
type MarketTab = "trending" | "movers" | "watchlist";

const RANKING: Record<MarketTab, TokenRanking> = {
  trending: "trending",
  movers: "top-gainer",
  // The watchlist is a client-side filter over a broad list rather than its own
  // ranking — there is no server-side watchlist to rank.
  watchlist: "top-marketcap",
};

/** 24h change from the token's own before-figure. Null when either side is missing,
 *  which is different from a flat 0% and must not render as one. */
function dayChangePct(price: number | null, before: number | null): number | null {
  if (price === null || before === null || before === 0) return null;
  return ((price - before) / before) * 100;
}

function TokenRow({
  token,
  networkSlug,
  starred,
  onToggleStar,
}: {
  token: Record<string, unknown>;
  networkSlug: string;
  starred: boolean;
  onToggleStar: (symbol: string) => void;
}) {
  const symbol = String(token.symbol ?? "");
  const name = String(token.name ?? symbol);
  const priceUSD = (token.priceUSD as number | null) ?? null;
  const before = (token.priceUSD1DayBF as number | null) ?? null;
  const marketCap = (token.marketCap as number | null) ?? null;
  const change = dayChangePct(priceUSD, before);

  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--m-border)] py-2 last:border-b-0">
      <Link
        href={`/token/${encodeURIComponent(symbol)}?chain=${encodeURIComponent(networkSlug)}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <TokenAvatar symbol={symbol} logoURI={(token.logoURI as string) ?? undefined} />
        <span className="flex min-w-0 flex-col gap-0.5 leading-4">
          <span className="truncate text-xs font-bold tracking-[-0.12px] text-[color:var(--m-text-primary)]">
            {symbol}
          </span>
          <span className="truncate text-[11px] text-[color:var(--m-text-secondary)]">{name}</span>
        </span>
      </Link>

      <span className="shrink-0 text-xs tabular-nums text-[color:var(--m-text-primary)]">
        {marketCap === null ? "—" : money(marketCap)}
      </span>

      <span
        className={cn(
          "w-16 shrink-0 text-right text-xs font-semibold tabular-nums",
          change === null
            ? "text-[color:var(--m-text-secondary)]"
            : change >= 0
              ? "text-[color:var(--m-success-fg)]"
              : "text-[color:var(--m-error-fg)]",
        )}
      >
        {/* An unpriced token shows a dash, never 0.00% — see dayChangePct. */}
        {change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(2)}%`}
      </span>

      <button
        type="button"
        onClick={() => onToggleStar(symbol)}
        aria-pressed={starred}
        aria-label={starred ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
        className={cn(
          "shrink-0 transition-colors",
          starred
            ? "text-[color:var(--m-warning)]"
            : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
        )}
      >
        <Star className="size-4" fill={starred ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export function HomeFeed({ networkSlug }: { networkSlug: string }) {
  const networkName = slugToNetworkName[networkSlug] ?? networkSlug;
  const { address: viewer } = useAccount();

  const [people, setPeople] = useState<PeopleTab>("callouts");
  const [market, setMarket] = useState<MarketTab>("trending");

  const scope: FeedScope = people === "friends" ? "following" : "all";
  const feed = useThesesFeed({
    networkName,
    scope,
    subject: viewer,
    // Only fetch posts when a post tab is showing; `useTokens` covers the rest.
    pageSize: people === "top" ? 1 : 20,
  });

  const tokens = useTokens(networkName, 30, 1, RANKING[market], "all");
  const { watchlist, addToWatchlist, removeFromWatchlist } = useWatchlist("token");

  const rows = useMemo(() => {
    const all = tokens.data?.tokens ?? [];
    if (market !== "watchlist") return all;
    const set = new Set(watchlist);
    return all.filter((t) => set.has(String((t as Record<string, unknown>).symbol ?? "")));
  }, [tokens.data, market, watchlist]);

  const requireWallet = useRequireWallet();

  /**
   * Same gate as `Organisms/StarButton`, and the same bug before it: this
   * returned the mutation's promise straight to an onClick, so with no wallet
   * connected the unauthorized write rejected unhandled and the page threw.
   */
  const toggleStar = (symbol: string) =>
    requireWallet(() => {
      const run = watchlist.includes(symbol)
        ? removeFromWatchlist(symbol)
        : addToWatchlist(symbol);
      void run.catch((error: unknown) =>
        toast.error("Could not update watchlist", {
          description: error instanceof Error ? error.message : undefined,
        }),
      );
    }, "Connect a wallet to keep a watchlist. It is stored against your address.");

  return (
    <section aria-label="Feed" className="flex w-full min-w-0 flex-col gap-3">
      {/* Above the feed, and only while work remains — both render null once a
          wallet is funded and trading. Home is where goal 01 belongs: the feed
          below argues for social trading on its own, so `ExploreIter` names only
          what a feed cannot show. */}
      <GetStartedCard />
      {/* One card per chain, under the single progress card rather than instead
          of it. The two answer different questions and both are short-lived:
          `GetStartedCard` is "how far along am I", which is one answer for the
          whole account; this is "where would I do what", which is a different
          answer per chain and is the only place a reader learns that another
          chain is where coins get launched. Both remove themselves when there is
          nothing left to do. */}
      <ChainOnboardingStack />
      <ExploreIter />
      <div role="tablist" aria-label="Feed source" className="flex items-center gap-1.5">
        {(
          [
            { id: "callouts", label: "Callouts" },
            { id: "friends", label: "Friends" },
            { id: "top", label: "Top" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={people === t.id}
            onClick={() => setPeople(t.id)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
              people === t.id
                ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
                : "border-transparent bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tablist" aria-label="Market view" className="flex items-center gap-1.5">
        {(
          [
            { id: "trending", label: "Trending" },
            { id: "movers", label: "Movers" },
            { id: "watchlist", label: "Watchlist" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={people === "top" && market === t.id}
            disabled={people !== "top"}
            onClick={() => setMarket(t.id)}
            title={people === "top" ? undefined : "Applies to the Top tab"}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40",
              people === "top" && market === t.id
                ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
                : "border-transparent bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="h-px w-full bg-[color:var(--m-border)]" />

      {people === "top" ? (
        tokens.isLoading ? (
          <div aria-busy="true" className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-[color:var(--m-surface-2)]"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-4 text-xs leading-5 text-[color:var(--m-text-secondary)]">
            {market === "watchlist"
              ? "Nothing watched yet. Star a market to pin it here — the watchlist is stored in this browser, so it won't follow you to another device."
              : "No markets to show."}
          </p>
        ) : (
          <div className="flex flex-col">
            {rows.map((t) => {
              const record = t as unknown as Record<string, unknown>;
              const symbol = String(record.symbol ?? "");
              return (
                <TokenRow
                  key={symbol || String(record.id)}
                  token={record}
                  networkSlug={networkSlug}
                  starred={watchlist.includes(symbol)}
                  onToggleStar={toggleStar}
                />
              );
            })}
          </div>
        )
      ) : feed.needsWallet ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-4 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          Connect a wallet to see callouts from the traders you follow.
        </p>
      ) : feed.isLoading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[color:var(--m-surface-2)]" />
          ))}
        </div>
      ) : feed.failed ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-4 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          Couldn&rsquo;t load callouts just now.
        </p>
      ) : feed.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-4 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          {people === "friends"
            ? "Nobody you follow has posted a callout yet."
            : "No callouts posted yet. Publish one from a trade on your profile."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {feed.rows.map((t) => (
            <CalloutCard key={t.id} thesis={t} networkSlug={networkSlug} />
          ))}
        </div>
      )}
    </section>
  );
}
