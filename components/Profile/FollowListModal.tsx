"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X as CloseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/Profile/ProfileAvatar";
import { useFollowList, type FollowDirection } from "@/hooks/useFollowList";

/**
 * Followers and Following, opened from the counts.
 *
 * ## Both directions live in one dialog
 *
 * They are the same list shape against the same route with one parameter
 * flipped, and a reader who opens Followers frequently wants Following next.
 * Two dialogs would mean two mounts, two close animations and a tab strip
 * duplicated across them.
 *
 * The count that was CLICKED selects the opening tab — `direction` is a prop,
 * not internal state, so tapping Following opens Following rather than opening
 * Followers and making the reader correct it.
 *
 * ## No URL, deliberately
 *
 * This is not deep-linkable. A follow list is a lookup performed while reading a
 * profile, not a destination someone shares — and giving it a route would mean a
 * page that renders a list with no context around it. If sharing one ever
 * matters, it becomes a tab in the strip (where `?tab=` already works), not a
 * modal with a synthetic URL.
 *
 * ## Only fetches while open
 *
 * `enabled` is gated on `open`, so a profile page does not pull two follow lists
 * nobody asked to see. The counts in the header come from the account read and
 * are already on screen.
 */
export function FollowListModal({
  open,
  onOpenChange,
  address,
  networkName,
  networkSlug,
  direction,
  followers,
  following,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  networkName: string;
  networkSlug: string;
  /** Which tab the clicked count selects. */
  direction: FollowDirection;
  followers: number;
  following: number;
}) {
  const [tab, setTab] = useState<FollowDirection>(direction);
  const [page, setPage] = useState(1);

  // Re-sync when the dialog is reopened from the OTHER count. Without this the
  // component keeps the tab from last time and the click appears to do nothing.
  useEffect(() => {
    if (open) {
      setTab(direction);
      setPage(1);
    }
  }, [open, direction]);

  const list = useFollowList({ networkName, address, direction: tab, page, enabled: open });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Close className="absolute -top-14 right-0 flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-deep)] text-[color:var(--m-text-primary)] transition-colors hover:bg-[color:var(--m-surface)]">
            <CloseIcon className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <DialogPrimitive.Title className="sr-only">
            {tab === "followers" ? "Followers" : "Following"}
          </DialogPrimitive.Title>

          <div className="overflow-hidden rounded-3xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-deep)]">
            <div className="flex gap-1.5 border-b border-[color:var(--m-border)] p-3">
              <Tab on={tab === "followers"} onClick={() => { setTab("followers"); setPage(1); }}>
                {followers.toLocaleString("en-US")} Followers
              </Tab>
              <Tab on={tab === "following"} onClick={() => { setTab("following"); setPage(1); }}>
                {following.toLocaleString("en-US")} Following
              </Tab>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {list.isLoading ? (
                <Message>Loading…</Message>
              ) : list.failed ? (
                // "The read failed" and "nobody follows them" are different
                // answers; the hook keeps them apart so this can too.
                <Message>Couldn&apos;t load the list.</Message>
              ) : list.entries.length === 0 ? (
                <Message>
                  {tab === "followers" ? "No followers yet." : "Not following anyone yet."}
                </Message>
              ) : (
                list.entries.map((entry) => (
                  <Entry
                    key={entry.address}
                    entry={entry}
                    networkSlug={networkSlug}
                    onNavigate={() => onOpenChange(false)}
                  />
                ))
              )}
            </div>

            {list.totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 border-t border-[color:var(--m-border)] px-3 py-3">
                <PagerButton onClick={() => setPage(page - 1)} disabled={page <= 1}>
                  ‹ Previous
                </PagerButton>
                <span className="min-w-[38px] rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-1.5 text-center font-mono text-[13px] text-[color:var(--m-text-primary)]">
                  {page}
                </span>
                <PagerButton onClick={() => setPage(page + 1)} disabled={page >= list.totalPages}>
                  Next ›
                </PagerButton>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Entry({
  entry,
  networkSlug,
  onNavigate,
}: {
  entry: ReturnType<typeof useFollowList>["entries"][number];
  networkSlug: string;
  onNavigate: () => void;
}) {
  const short = `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`;
  // A wallet followed before it was ever looked up has no profile row — the
  // entry still belongs in the list, with the address standing in for the name.
  // Same for a deleted profile, which the route tombstones out of the join.
  const name = entry.displayName ?? short;

  return (
    <Link
      href={`/profile/${entry.address}?chain=${encodeURIComponent(networkSlug)}`}
      onClick={onNavigate}
      className="flex items-center gap-3 border-b border-[color:var(--m-border)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[color:var(--m-surface-2)]"
    >
      {/* `ProfileAvatar` — see its note in LeaderboardColumn. `name` is passed
          so a follower with no picture shows the same initial here as on the
          profile this row links to. */}
      <ProfileAvatar address={entry.address} name={name} src={entry.avatarUrl} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold tracking-[-0.015em] text-[color:var(--m-text-primary)]">
          {name}
        </span>
        <span className="block truncate font-mono text-[11.5px] text-[color:var(--m-text-secondary)]">
          {entry.handle ? `@${entry.handle}` : short}
        </span>
      </span>
    </Link>
  );
}

function Tab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={on}
      role="tab"
      className={cn(
        "flex-1 rounded-full border px-3 py-2 text-[13px] font-bold transition-colors",
        on
          ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-selected)] text-[color:var(--m-primary)]"
          : "border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
      {children}
    </p>
  );
}

function PagerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[9px] px-3 py-1.5 text-[13.5px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
