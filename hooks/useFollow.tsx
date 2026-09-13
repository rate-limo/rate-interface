"use client";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";
import { isSignatureRejection, setFollowing } from "@/lib/profile/follow";
import { requestWalletConnect } from "@/lib/wallet/connectGate";

/**
 * The Follow button's state and write.
 *
 * `initialFollowing` comes from `/api/account/:address?viewer=` on the first
 * render — a separate "am I following?" request would resolve after the header
 * it belongs to, so the button would mount as "Follow" and then flip for anyone
 * who already did, which reads as the page undoing the user's own action.
 *
 * `null` means unknown (no viewer, or a malformed one) and is deliberately
 * distinct from `false`: a logged-out visitor's button is neutral, not "you do
 * not follow this person".
 *
 * ## Not optimistic, on purpose
 *
 * The state flips only after the server answers, and the follower count is
 * whatever the server re-read rather than a local ±1. This costs a beat of
 * latency and buys correctness under the two cases that actually happen: a
 * declined signature (an optimistic flip would have to roll back, which looks
 * like a bug) and a second tab that already followed (a local increment and the
 * server disagree permanently, and the header is where that shows).
 *
 * Straight from wagmi's `useSignMessage`, like every other signing path here —
 * `lib/wallet` is the CONNECT seam, not the signing one (see apps/web/CLAUDE.md).
 */
export function useFollow({
  networkName,
  address,
  initialFollowing,
  initialFollowers,
}: {
  networkName: string;
  /** The wallet being followed. */
  address: string;
  initialFollowing: boolean | null;
  initialFollowers: number;
}) {
  const { address: viewer } = useAccount();
  const { signMessageAsync } = useSignMessage();
  /**
   * OVERRIDES, not snapshots.
   *
   * These were `useState(initialFollowing)` / `useState(initialFollowers)`,
   * which reads the argument on MOUNT only. `IdentityCard` renders while the
   * account query is still loading, and the fallback in that window is
   * `emptyAccountProfile` — followers 0, viewerFollows null. So the counts
   * froze at 0 and the button froze at "Follow" even after the real numbers
   * arrived, which is how a profile showed "0 Followers" beside a correct
   * "96 Following" read straight from the same prop.
   *
   * Null means "no local write has happened", so the prop wins; a successful
   * follow/unfollow sets the override and it wins from then on.
   */
  const [followingOverride, setFollowingOverride] = useState<boolean | null>(null);
  const [followersOverride, setFollowersOverride] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const following = followingOverride ?? initialFollowing;
  const followers = followersOverride ?? initialFollowers;

  const isSelf = !!viewer && viewer.toLowerCase() === address.toLowerCase();

  /**
   * Follow, or ask for a wallet first.
   *
   * A disconnected visitor used to get a DISABLED button with a tooltip saying
   * "Connect a wallet to follow" — an instruction with nothing to click. The
   * tooltip named the fix and the control refused to perform it, so the only way
   * forward was to find the wallet button yourself and come back.
   *
   * Asking lives here rather than in each consumer because "no viewer" is this
   * hook's own condition; both call sites had reimplemented the same disabled
   * state from the old `canFollow`, and a third would have had to remember to.
   *
   * `isSelf` still returns early and is still the consumers' business to render:
   * following yourself is not an action that exists, so it is hidden, not gated.
   */
  const toggle = async () => {
    if (pending || isSelf) return;
    if (!viewer) {
      requestWalletConnect("Connect a wallet to follow people on Iter.");
      return;
    }
    setPending(true);
    try {
      const result = await setFollowing({
        follower: viewer,
        following: address,
        action: following ? "unfollow" : "follow",
        signMessageAsync,
      });
      setFollowingOverride(result.following);
      setFollowersOverride(result.followers);
    } catch (error) {
      // A declined signature is the user's decision. Reporting it as an error
      // would tell someone their own choice failed.
      if (!isSignatureRejection(error)) {
        toast.error(error instanceof Error ? error.message : "Couldn't update follow");
      }
    } finally {
      setPending(false);
    }
  };

  // `canFollow` was removed with the disabled state it existed to drive: a
  // disconnected visitor is no longer refused, they are asked.
  return { following, followers, pending, isSelf, toggle };
}
