"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/Profile/ProfileAvatar";
import { TokenAvatar, money } from "@/components/Portfolio/parts";
import type { FeedThesis } from "@/hooks/useThesesFeed";

/**
 * One callout in the feed: who said it, what they were holding when they said
 * it, and the claim itself.
 *
 * ## The stake is the point
 *
 * `valueUsd` and `plotPrice` are denormalised onto the post at write time (see
 * `admin.theses`' schema doc — a rebuild of `spotTrades` must not move or delete
 * an already-published post). They render here for the reason the gateway sends
 * them: a post without the trade behind it is an opinion, and "$4,120 of NOVA at
 * $0.0061" is a position. The chart marks read the same fields from the same
 * row, so the two surfaces cannot disagree about what someone risked.
 *
 * ## Deliberately not the position card
 *
 * `PositionMiniCard` renders a CURRENT position — live value, net PnL, whether
 * it is still open. A callout is a fixed historical claim, and showing today's
 * PnL against it would silently re-score somebody's past statement every time
 * the price moved. Different subject, different card.
 *
 * ## `showToken` is for the surface that already named the coin
 *
 * On the home feed a callout arrives out of nowhere and the coin is the first
 * thing a reader needs. On a token profile it is the page they are already on,
 * so the token row and the "called SYMBOL" chip are the same word three times
 * in one card. Off by default nowhere — the feed is the common case; the token
 * profile passes false.
 */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Prices here span cents to fractions of a cent, so a fixed 2dp would render
 *  most launch tokens as "$0.00". Significant digits instead. */
function price(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function CalloutCard({
  thesis,
  networkSlug,
  showToken = true,
  className,
}: {
  thesis: FeedThesis;
  networkSlug: string;
  /** False on a surface that has already named the coin — see above. */
  showToken?: boolean;
  className?: string;
}) {
  const symbol = thesis.symbol ?? "—";
  // The claimed name first, the address only when there is none. `handle` is
  // the unique one, so it wins over a display name two wallets could share.
  const author = thesis.authorHandle ?? thesis.authorDisplayName ?? shortAddress(thesis.author);

  return (
    /*
      One card, author included.
      The byline used to sit OUTSIDE the bordered box, floating on the page above
      it — so a callout read as two unrelated things stacked, and in a column of
      them there was no boundary saying where one post ended and the next began.
      A post is the author, the token and what they said; the card is the post.
    */
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3",
        className,
      )}
    >
      {/*
        Author LEFT, stake RIGHT, one row.

        The stake used to live on the row below, sharing it with the token — and
        on a token profile, which passes `showToken={false}`, that row had nothing
        in its left half. So the card rendered a byline, then a band of empty
        space with "Size / At call" pinned to the far edge of it, then the body:
        three loosely-related blocks where a post is one thing. Putting the two
        halves of "who, and how much" on the same line closes that gap in both
        variants rather than only the one that showed it.
      */}
      <div className="flex items-start justify-between gap-3 text-xs text-[color:var(--m-text-secondary)]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link
            href={`/profile/${thesis.author}?chain=${encodeURIComponent(networkSlug)}`}
            className="flex min-w-0 items-center gap-2"
          >
            {/* `ProfileAvatar`, like every other avatar — a hand-rolled disc here is
                how this surface drifted from the modal in the first place. */}
            <ProfileAvatar
              address={thesis.author}
              name={author}
              src={thesis.authorAvatarUrl}
              size={20}
              className="shrink-0"
            />
            <span className="truncate text-xs font-semibold text-[color:var(--m-text-primary)] hover:underline">
              {author}
            </span>
          </Link>
          {showToken && (
            <>
              <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--m-text-secondary)]" />
              <span className="truncate">called {symbol}</span>
            </>
          )}
          <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--m-text-secondary)]" />
          <time dateTime={thesis.createdAt}>{timeAgo(thesis.createdAt)}</time>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="flex flex-col items-end gap-0.5 text-xs leading-4">
            <span className="whitespace-nowrap text-[color:var(--m-text-secondary)]">Size</span>
            <span className="whitespace-nowrap tabular-nums text-[color:var(--m-text-primary)]">
              {money(thesis.valueUsd)}
            </span>
          </span>
          <span className="flex flex-col items-end gap-0.5 text-xs leading-4">
            <span className="whitespace-nowrap text-[color:var(--m-text-secondary)]">At call</span>
            <span className="whitespace-nowrap tabular-nums text-[color:var(--m-text-secondary-2)]">
              {price(thesis.plotPrice)}
            </span>
          </span>
        </div>
      </div>

      {/* Only the feed needs this: a token profile has already named the coin at
          the top of the page, and repeating it here was the third printing of the
          same word in one card. */}
      {showToken && (
        <Link
          href={`/token/${thesis.tokenAddress}?chain=${encodeURIComponent(networkSlug)}`}
          className="flex min-w-0 items-center gap-2"
        >
          <TokenAvatar symbol={symbol} logoURI={thesis.logoURI ?? undefined} />
          <span className="flex min-w-0 flex-col gap-0.5 leading-4">
            <span className="truncate text-xs font-bold tracking-[-0.12px] text-[color:var(--m-text-primary)]">
              {symbol}
            </span>
            <span className="truncate text-[11px] text-[color:var(--m-text-secondary)]">
              {thesis.name ?? shortAddress(thesis.tokenAddress)}
            </span>
          </span>
        </Link>
      )}

      <p className="whitespace-pre-line text-xs leading-5 text-[color:var(--m-text-secondary-2)]">
        {thesis.body}
      </p>
    </article>
  );
}
