"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { networkNameToSlug } from "@/consts";
import { useThesesFeed } from "@/hooks/useThesesFeed";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { useAccountPositions } from "@/hooks/useAccountPositions";
import { useFollow } from "@/hooks/useFollow";
import { formatUsd } from "@/utils/number";
import { signedMoney } from "@/components/Social/PositionMiniCard";
import type { ThesisMark } from "@/lib/chart/marks";

/**
 * What a chart mark opens: who said it, everything else they have said about
 * this coin, and the position behind it.
 *
 * ## Scope, and what is deliberately absent
 *
 * Identity, thread and position. Buy/Sell and a chart of their own are a second
 * pass — the mark promises "who is this and what are they holding", and a
 * trading surface inside a popover opened from a chart is a second place to
 * place an order competing with the one already on the page.
 *
 * There are no likes. Nothing stores them: no table, no route, nowhere to write
 * one. A heart rendered here would be a control that does nothing, which is
 * worse than its absence.
 *
 * ## The thread is scoped SERVER-side
 *
 * `/api/theses/token/:address?author=` — both halves indexed, one predicate.
 * Filtering a page in the browser instead would routinely drop the author's own
 * callouts off page one on a busy coin, and the modal would show an empty thread
 * under the very post it was opened from.
 *
 * ## The position is the ledger's, not the wallet's
 *
 * `broker.spotPositions` accounts for what was FILLED. A wallet that was
 * airdropped the coin holds it and does not appear here, and that is the honest
 * reading for a card about somebody's stake in a claim they made. `valueUSD`
 * null means no price, never zero — see `lib/portfolio/positions.ts`.
 */
export function CalloutModal({
  mark,
  networkName,
  tokenAddress,
  tokenSymbol,
  open,
  onOpenChange,
}: {
  mark: ThesisMark | null;
  networkName: string;
  /** The coin the chart is showing — the thread and the position both scope to it. */
  tokenAddress: string;
  tokenSymbol: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const author = mark?.author ?? "";
  const slug = networkNameToSlug[networkName] ?? "";
  const { address: viewer } = useAccount();
  const [copied, setCopied] = useState(false);

  const profile = useAccountProfile(networkName, open && author ? author : undefined, viewer);
  const positions = useAccountPositions(networkName, open && author ? author : undefined);

  const thread = useThesesFeed({
    networkName,
    scope: "token",
    subject: open && tokenAddress ? tokenAddress : undefined,
    author: open && author ? author : undefined,
    pageSize: 25,
  });

  const follow = useFollow({
    networkName,
    address: author,
    initialFollowing: profile.data.social.viewerFollows,
    initialFollowers: profile.data.social.followers,
  });

  // Matched on the token this chart is about, not on symbol: a venue where
  // anyone can mint a coin called PONS makes a symbol match a way to show one
  // wallet another coin's position.
  const position = useMemo(
    () =>
      positions.data.positions.find(
        (p) => p.token.toLowerCase() === tokenAddress.toLowerCase(),
      ) ?? null,
    [positions.data.positions, tokenAddress],
  );

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!mark) return null;

  const name = profile.data.profile.displayName || profile.data.profile.handle || mark.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{name}&apos;s callouts on {tokenSymbol}</DialogTitle>

        {/* ------------------------------------------------------- identity */}
        <div className="flex items-center gap-3 border-b border-[color:var(--m-border)] px-5 py-4">
          <Avatar url={profile.data.profile.avatarUrl ?? mark.avatarUrl} name={name} size={34} />
          <div className="min-w-0">
            <Link
              href={`/profile/${author}?chain=${encodeURIComponent(slug)}`}
              className="truncate text-[15px] font-semibold text-[color:var(--m-text-primary)] hover:underline"
            >
              {name}
            </Link>
            {profile.data.profile.handle && profile.data.profile.displayName ? (
              <div className="truncate font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary-2)]">
                {profile.data.profile.handle}
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // The link is to the PROFILE, not to the callout: there is no
                // route that resolves a single thesis yet, and a share link that
                // 404s is worse than one that lands a step away.
                navigator.clipboard
                  ?.writeText(`${window.location.origin}/profile/${author}?chain=${slug}`)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className={cn(
                "rounded-[8px] border border-[color:var(--m-border)] px-3 py-1.5",
                "text-[13px] font-semibold text-[color:var(--m-text-primary)]",
                "transition-colors hover:bg-[color:var(--m-surface-2)]",
              )}
            >
              {copied ? "Copied" : "Share"}
            </button>
            {viewer && viewer.toLowerCase() !== author.toLowerCase() && (
              <button
                type="button"
                onClick={follow.toggle}
                disabled={follow.pending}
                className={cn(
                  "rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  follow.following
                    ? "border border-[color:var(--m-border)] text-[color:var(--m-text-primary)] hover:bg-[color:var(--m-surface-2)]"
                    : "bg-[color:var(--m-primary)] text-white hover:opacity-90",
                  follow.pending && "opacity-60",
                )}
              >
                {follow.following ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------- position */}
        <div className="border-b border-[color:var(--m-border)] px-5 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-[color:var(--m-text-secondary)]">
              Their {tokenSymbol} position
            </span>
            <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
              from fills
            </span>
          </div>

          {positions.isLoading ? (
            <div className="h-[52px] animate-pulse rounded-[10px] bg-[color:var(--m-surface-2)]" />
          ) : position && position.amount > 0 ? (
            <div className="rounded-[12px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-dm-mono text-[20px] font-semibold tabular-nums text-[color:var(--m-text-primary)]">
                    {position.valueUSD === null ? (
                      <span className="text-[15px] text-[color:var(--m-text-secondary-2)]">
                        no price
                      </span>
                    ) : (
                      formatUsd(position.valueUSD)
                    )}
                  </div>
                  <div className="font-dm-mono text-[12.5px] tabular-nums text-[color:var(--m-text-secondary)]">
                    {compact(position.amount)} {tokenSymbol}
                  </div>
                </div>
                {position.unrealizedPnlUSD !== null && (
                  <div
                    className={cn(
                      "text-right font-dm-mono text-[17px] font-semibold tabular-nums",
                      position.unrealizedPnlUSD >= 0
                        ? "text-[color:var(--m-success)]"
                        : "text-[color:var(--m-error)]",
                    )}
                  >
                    {signedMoney(position.unrealizedPnlUSD)}
                  </div>
                )}
              </div>
              <div className="mt-3 flex justify-between gap-3 border-t border-dashed border-[color:var(--m-border)] pt-2.5 text-[12.5px] text-[color:var(--m-text-secondary)]">
                <span>
                  Avg. entry{" "}
                  <b className="font-dm-mono font-semibold text-[color:var(--m-text-primary)]">
                    {formatUsd(position.avgEntryUSD)}
                  </b>
                </span>
                <span>
                  Invested{" "}
                  <b className="font-dm-mono font-semibold text-[color:var(--m-text-primary)]">
                    {formatUsd(position.costUSD)}
                  </b>
                </span>
              </div>
              {position.untrackedSold > 0 && (
                <div className="mt-2 text-[11px] text-[color:var(--m-warning,#d08700)]">
                  Sold more than the ledger saw bought — this basis is partial.
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-[color:var(--m-text-secondary)]">
              No open position. They may have closed it, or acquired the coin somewhere
              the fill ledger cannot see.
            </p>
          )}
        </div>

        {/* --------------------------------------------------------- thread */}
        <div className="max-h-[320px] overflow-y-auto px-5 py-4">
          <div className="mb-3 text-[12px] font-medium text-[color:var(--m-text-secondary)]">
            On {tokenSymbol}
            {thread.rows.length > 0 && ` · ${thread.totalCount}`}
          </div>

          {thread.isLoading && (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-[10px] bg-[color:var(--m-surface-2)]" />
              ))}
            </div>
          )}

          {!thread.isLoading && thread.rows.length === 0 && (
            <p className="text-[13px] text-[color:var(--m-text-secondary)]">
              {/* The mark that opened this exists, so an empty thread means the
                  read failed rather than that they never posted. */}
              {thread.failed
                ? "Their callouts could not be loaded."
                : `Nothing else from ${name} on ${tokenSymbol}.`}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {thread.rows.map((post) => (
              <article key={post.id} className="grid grid-cols-[30px_1fr] gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <Avatar url={post.authorAvatarUrl ?? mark.avatarUrl} name={name} size={26} />
                  <span className="w-px flex-1 bg-[color:var(--m-border)]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[13.5px]">
                    <span className="font-semibold text-[color:var(--m-text-primary)]">{name}</span>
                    {post.id === mark.id && (
                      <span
                        className={cn(
                          "rounded-[5px] border border-[color:var(--m-primary)]/40 px-1.5",
                          "bg-[color:var(--m-primary)]/15 text-[11px] font-semibold",
                          "text-[color:var(--m-primary)]",
                        )}
                      >
                        this mark
                      </span>
                    )}
                    <span className="font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary-2)]">
                      {ago(post.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-[14px] leading-[1.45] text-[color:var(--m-text-primary)]">
                    {post.body}
                  </p>
                  <div className="mt-1.5 font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                    {formatUsd(post.valueUsd)} behind it
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="grid shrink-0 place-items-center rounded-full bg-[color:var(--m-primary)] font-bold text-white"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
