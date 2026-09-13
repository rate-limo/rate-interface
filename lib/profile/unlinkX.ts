"use client";

import type { SignMessage } from "./deleteProfile";

/**
 * Detach a verified X account from a wallet.
 *
 * ## Why it needs a signature at all
 *
 * The same reason linking does: these routes are public, and the request body's `address`
 * is a claim until something proves it. Without the nonce → sign → verify round trip,
 * anyone could unlink anyone's X account by POSTing their address — which is a griefing
 * primitive, not a feature. `apps/identity-service/src/accountProfileWrites.ts` recovers
 * the signer and compares.
 *
 * The action has its OWN nonce kind (`unlink-x`) rather than reusing edit's or delete's:
 * a captured signature for one must not be replayable as another, which is the same
 * separation the service keeps between its referral, X-link and profile nonce stores.
 *
 * ## Unlinking is not deleting
 *
 * It clears the four X columns and nothing else — the display name, handle, avatar and
 * banner are the user's own work and survive it. The message the wallet shows says so,
 * because a signature prompt that does not name its own consequence is a trap.
 *
 * Same-origin through the `next.config.ts` rewrite, like every other identity-service
 * call, so no CORS preflight is involved.
 */

const NONCE_PATH = "/profile/nonce";
const UNLINK_PATH = "/profile/x-unlink";

export type UnlinkOutcome =
  | { ok: true }
  /** The user dismissed the wallet prompt. Nothing was attempted, nothing was lost. */
  | { ok: false; declined: true; message: string }
  | { ok: false; declined: false; message: string };

/** A rejected signature is a decision, not a fault — same rule as `deleteProfile`. */
function isRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

export async function unlinkX(
  address: string,
  signMessageAsync: SignMessage,
): Promise<UnlinkOutcome> {
  try {
    const nonceRes = await fetch(NONCE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `action`, matching the server's field name. Delete sent `intent` here and got a
      // 400 for it; there is no shared type across the boundary, so the name is pinned
      // by a test on each side instead.
      body: JSON.stringify({ address, action: "unlink-x" }),
    });
    const issued = (await nonceRes.json().catch(() => null)) as
      | { nonce?: string; message?: string }
      | null;
    if (!nonceRes.ok || !issued?.nonce || !issued.message) {
      return { ok: false, declined: false, message: "Couldn't start that. Try again." };
    }

    const signature = await signMessageAsync({ message: issued.message });

    const res = await fetch(UNLINK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, nonce: issued.nonce, signature }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        declined: false,
        message: body?.error ?? "Couldn't disconnect X. Try again.",
      };
    }
    return { ok: true };
  } catch (error) {
    if (isRejection(error)) {
      return { ok: false, declined: true, message: "Signature declined — X is still connected." };
    }
    return { ok: false, declined: false, message: "Couldn't disconnect X. Try again." };
  }
}
