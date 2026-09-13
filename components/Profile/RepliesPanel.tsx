"use client";

import { CalloutCard } from "@/components/Social/CalloutCard";
import { useThesesFeed } from "@/hooks/useThesesFeed";

/**
 * A wallet's own posts.
 *
 * Reuses `CalloutCard` rather than growing a profile-specific post row: a
 * callout is the same object here as in the home feed, and two renderers would
 * drift on the thing that matters most — the anchored trade's size, which is the
 * stake behind the claim.
 *
 * `scope: "author"` passes the PROFILE's address as the subject, not the
 * viewer's. That distinction is the whole reason `FeedScope` carries three
 * values: `following` reads the viewer's graph, `author` reads one wallet's
 * output, and mixing them would show a visitor their own posts on someone
 * else's page.
 *
 * No wallet needed — the subject comes from the URL, so this renders for a
 * logged-out visitor.
 */
export function RepliesPanel({
  address,
  networkName,
  networkSlug,
}: {
  address: string;
  networkName: string;
  networkSlug: string;
}) {
  const { rows, failed, isLoading } = useThesesFeed({
    networkName,
    scope: "author",
    subject: address,
  });

  return (
    <div className="overflow-hidden rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      {isLoading ? (
        <p className="px-4 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
          Loading…
        </p>
      ) : failed ? (
        // "The read failed" and "nothing posted" are different answers, and the
        // hook keeps them apart precisely so this can too.
        <p className="px-4 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
          Couldn&apos;t load posts.
        </p>
      ) : rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-[13.5px] text-[color:var(--m-text-secondary)]">No posts yet.</p>
          {/* The threshold is why most wallets have none, and saying so stops an
              empty tab reading as broken. */}
          <p className="mx-auto mt-1.5 max-w-[40ch] text-[12px] text-[color:var(--m-text-secondary-2)]">
            A post is anchored to a trade over $1,000 — the stake that earns the
            right to make the call.
          </p>
        </div>
      ) : (
        rows.map((thesis) => (
          <div
            key={thesis.id}
            className="border-b border-[color:var(--m-border)] px-4 py-3 last:border-b-0"
          >
            <CalloutCard thesis={thesis} networkSlug={networkSlug} />
          </div>
        ))
      )}
    </div>
  );
}
