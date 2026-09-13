"use client";

/**
 * Deleting the profile this app generated for a wallet.
 *
 * Deliberately the same nonce-then-sign shape as `lib/referral/apply.ts`, and for
 * the same reason: the server RECOVERS the address from the signature rather than
 * reading it from the body. Without that, deleting someone else's profile would be
 * a curl command away — and unlike a referral link, a delete cannot be undone by
 * the victim, only re-created under a new name and a new joined date.
 *
 * ## Why the endpoints live in one place
 *
 * These two paths are same-origin rewrites to admin-service (see `next.config.ts`),
 * which means each one needs a rewrite entry AND an exclusion in `proxy.ts`'s
 * matcher. Missing the second is silent: the rewrite is right, the service route is
 * right, and the request still 404s because next-intl claimed the path first. That
 * is the exact failure the file's own comment warns about for `/logo` and
 * `/token-logo`. Keeping both paths as constants here means there is one place to
 * check them against the proxy list.
 */

const NONCE_PATH = "/profile/nonce";
const DELETE_PATH = "/profile/delete";

export type DeleteOutcome =
  | { ok: true; existed: boolean }
  /** The user dismissed the wallet prompt. Nothing was attempted, nothing was lost. */
  | { ok: false; declined: true; message: string }
  | { ok: false; declined: false; message: string };

export interface SignMessage {
  (args: { message: string }): Promise<string>;
}

/** A rejected signature is a decision, not a fault. Reporting it as an error hides
 * the retry and blames the user for choosing not to proceed. */
function isRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

export async function deleteProfile(
  address: string,
  signMessageAsync: SignMessage,
): Promise<DeleteOutcome> {
  try {
    const nonceRes = await fetch(NONCE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `action`, not `intent`. The server reads `body.action` and answers
      // `400 {"error":"action is required"}` to anything else — verified against the
      // deployed identity-service, which means Delete profile has been failing at the
      // first request. The two names never had to agree in a type, which is exactly how
      // they drifted; `deleteProfile.test.ts` now pins the field.
      body: JSON.stringify({ address, action: "delete" }),
    });
    const issued = (await nonceRes.json().catch(() => null)) as
      | { nonce?: string; message?: string }
      | null;
    if (!nonceRes.ok || !issued?.nonce || !issued.message) {
      return { ok: false, declined: false, message: "Couldn't start that. Try again." };
    }

    // The server writes the message text, and it must say plainly that signing
    // deletes the profile — this is the only thing the user sees in their wallet,
    // and a signature prompt that does not name its own consequence is a trap.
    const signature = await signMessageAsync({ message: issued.message });

    const res = await fetch(DELETE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, nonce: issued.nonce, signature }),
    });
    const body = (await res.json().catch(() => null)) as
      | { existed?: boolean; error?: string }
      | null;
    if (!res.ok) {
      return { ok: false, declined: false, message: body?.error ?? "Couldn't delete that." };
    }
    // `existed` lets the page tell the truth about what just happened rather than
    // claiming a deletion that removed nothing.
    return { ok: true, existed: body?.existed ?? true };
  } catch (err) {
    return isRejection(err)
      ? {
          ok: false,
          declined: true,
          message: "You didn't sign, so nothing was deleted.",
        }
      : { ok: false, declined: false, message: "Couldn't reach the service. Try again." };
  }
}
