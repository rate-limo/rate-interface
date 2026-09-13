"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { ProfileView } from "@/components/Profile/ProfileView";

/** Local, matching the leaderboard row this modal opens from — the two must
 *  render the same fallback name for the same wallet. */
function shortAddress(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

/**
 * A trader, previewed in place.
 *
 * The leaderboard rows on `/home` navigated to `/profile/[address]`, which is the
 * right destination for "tell me everything about this wallet" and the wrong one
 * for "who is #3". Ranking is a browsing surface: the reader is comparing rows,
 * and a full page load costs them their place in the list and their scroll
 * position to answer a question they wanted a glance at.
 *
 * It opened as a PREVIEW — handle, follower counts, lifetime trades and volume — on the
 * argument that a modal trying to be the profile ends up a worse profile. That was
 * overruled (2026-09-06, user direction): the summary answered fewer questions than the
 * ranking row that opened it, so the body is now `ProfileView`, the same component
 * `/profile/[address]` renders.
 *
 * The link out survives that change and is not a footnote. A modal still has no URL,
 * nothing to share and no back button, so the page remains the thing a reader can send
 * to someone — which is exactly why it stays a button rather than a hint.
 *
 * ## The viewer is passed, and it changes the answer
 *
 * `useAccountProfile` takes the CONNECTED wallet as its third argument, which is
 * what makes `social.viewerFollows` come back as a real boolean rather than
 * null. That hook's own docstring records why it matters: unscoped, the answer
 * is "unknown", and a Follow control painted from it tells someone who already
 * follows this trader that they do not.
 *
 * There is no Follow button here on purpose — following is an action, and this
 * is a reading surface; the profile page owns it. The count is shown because a
 * count is a fact about the trader, not a control.
 */
export function TraderProfileModal({
  address,
  networkName,
  networkSlug,
  open,
  onOpenChange,
}: {
  address: string | null;
  networkName: string;
  networkSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { address: viewer } = useAccount();
  // Kept only for the dialog's accessible title and the loading state — the body below
  // is the profile page's own component, which fetches everything it needs itself.
  const { data } = useAccountProfile(networkName, address ?? undefined, viewer);
  const name =
    data?.profile.displayName ?? data?.profile.handle ?? shortAddress(address ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Sized to its content, not to the viewport.
          It was `max-h-[86vh] … overflow-y-auto` around the whole `ProfileView`, which put
          a scrollbar through the middle of a preview and cut the coin table off mid-row —
          a dialog that scrolls is a page with the affordances taken away. The body is two
          cards now, so it simply fits; the cap is a guard for a very short window, not a
          layout the design depends on. */}
      <DialogContent className="max-h-[92vh] w-[min(560px,94vw)] max-w-none gap-0 overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>

        {address && (
          <div className="p-4 sm:p-5">
            {/* The page's own two opening cards — identity and performance — from the
                same component and the same hooks, so the modal cannot drift from the page
                about one wallet's followers or PnL. `compact` drops the five tab panels
                and the coin table, which are what a dialog has no room for. */}
            <ProfileView address={address} networkSlug={networkSlug} compact />

            {/* The link out stays, and stays first-class. A modal has no URL, nothing to
                share and no back button; whatever it shows, the page is still the thing
                a reader can send to someone. */}
            <Link
              href={`/profile/${address}?chain=${encodeURIComponent(networkSlug)}`}
              onClick={() => onOpenChange(false)}
              data-testid="trader-modal-open-profile"
              className="mt-4 flex h-11 items-center justify-center rounded-xl bg-[color:var(--m-primary)] text-[13px] font-semibold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
            >
              Open full profile
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
