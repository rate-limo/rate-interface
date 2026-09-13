"use client";

/**
 * Follow / unfollow, signed.
 *
 * Hits the gateway directly, like every other portfolio fetcher in this app —
 * gateway is CORS-open for browser calls, unlike admin-service's routes, which
 * go through a `next.config.ts` same-origin rewrite. See the PonderLinks note in
 * `consts/index.ts`.
 *
 * ## The follower is proved, never asserted
 *
 * The signature is over a message naming the ACTION and the TARGET as well as
 * the follower, and the gateway rejects anything that does not verify. The
 * body's `follower` field only lets the server confirm the recovery matches what
 * the caller claims — it is never trusted on its own, the same rule
 * `lib/portfolio/profile.ts` and `lib/referral/apply.ts` both state.
 *
 * Naming the action and target in the signed bytes is what stops one signature
 * being spent as another: a profile-edit signature cannot follow anyone, one
 * follow signature cannot follow a second account, and a follow cannot be
 * replayed as an unfollow. `apps/gateway/src/followAuth.test.ts` pins all three.
 */


export type FollowAction = "follow" | "unfollow";

export interface FollowResult {
  address: string;
  follower: string;
  /** The resulting state — true when this wallet now follows `address`. */
  following: boolean;
  /** Re-read from the server, never incremented locally. */
  followers: number;
}

/** Must match `apps/gateway/src/followAuth.ts`'s canonical message exactly;
 * that file's test pins the literal. */
function followMessage(
  action: FollowAction,
  follower: string,
  following: string,
  timestamp: number,
): string {
  return [
    `Iter: ${action}`,
    `follower: ${follower.toLowerCase()}`,
    `following: ${following.toLowerCase()}`,
    `timestamp: ${timestamp}`,
  ].join("\n");
}

/** A rejected signature is a decision, not an error — callers must not surface
 * it as a failure. Mirrors `lib/portfolio/profile.ts`'s `isSignatureRejection`. */
export function isSignatureRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body?.error as string | undefined) ?? `Request failed (${res.status})`;
}

export async function setFollowing(
  // `networkName` is gone: `follows` is chain-agnostic and the write now goes
  // to identity-service, so there is no per-chain gateway to pick.
  {
    follower,
    following,
    action,
    signMessageAsync,
  }: {
    follower: string;
    following: string;
    action: FollowAction;
    signMessageAsync: (args: { message: string }) => Promise<string>;
  },
): Promise<FollowResult> {
  const timestamp = Date.now();
  const signature = await signMessageAsync({
    message: followMessage(action, follower, following, timestamp),
  });

  // Same-origin, rewritten to IDENTITY_SERVICE_URL — NOT the per-chain gateway.
  // `follows` is identity: the same wallet has one follower list across every
  // chain, and identity-service is the single writer of that table. Going
  // through the rewrite rather than calling auth.iter.cx directly keeps this a
  // same-origin request, so no CORS preflight is involved.
  const res = await fetch(
    `/follow/${encodeURIComponent(following)}`,
    {
      // The verb is the action. It is also inside the signed message, so the
      // two cannot disagree without the signature failing.
      method: action === "follow" ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ follower, timestamp, signature }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as FollowResult;
}
