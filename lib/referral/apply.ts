"use client";

/**
 * Applying someone else's referral code to this wallet.
 *
 * Extracted from InviteView so the onboarding step and the invite landing run
 * the SAME code. Two copies of a nonce-then-sign handshake is how one of them
 * quietly stops consuming the nonce, or starts sending the address in the body
 * — which is the exact hole the signature exists to close.
 *
 * ## The address is proved, never asserted
 *
 * The server issues a single-use nonce, the wallet signs a message containing
 * it, and the server RECOVERS the address from that signature. The request body
 * carries an address only so the server can check the recovery matches; it is
 * never trusted on its own. Without this, anyone could attach any wallet to
 * their own code and the referral graph would be whatever the last caller
 * claimed.
 */

export type ApplyOutcome =
  | { ok: true }
  /** The user dismissed the wallet prompt. Not a failure — nothing was attempted. */
  | { ok: false; declined: true; message: string }
  | { ok: false; declined: false; message: string };

export interface SignMessage {
  (args: { message: string }): Promise<string>;
}

/** A rejected signature is a decision, not an error, and must not be reported
 * as one — that would hide the retry and blame the user for a fault. */
function isRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

export async function applyReferralCode(
  code: string,
  address: string,
  signMessageAsync: SignMessage,
): Promise<ApplyOutcome> {
  try {
    const nonceRes = await fetch("/referral/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const issued = (await nonceRes.json().catch(() => null)) as
      | { nonce?: string; message?: string }
      | null;
    if (!nonceRes.ok || !issued?.nonce || !issued.message) {
      return { ok: false, declined: false, message: "Couldn't start that. Try again." };
    }

    const signature = await signMessageAsync({ message: issued.message });

    const res = await fetch("/referral/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, nonce: issued.nonce, signature }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      // The server's refusals are written for a user to read (self-referral,
      // already-linked, unknown code) — pass them through rather than
      // flattening them into one generic failure.
      return {
        ok: false,
        declined: false,
        message: body?.error ?? "Couldn't apply that code.",
      };
    }
    return { ok: true };
  } catch (err) {
    return isRejection(err)
      ? {
          ok: false,
          declined: true,
          message: "You didn't sign, so nothing was linked. Try again when you're ready.",
        }
      : { ok: false, declined: false, message: "Couldn't reach the service. Try again." };
  }
}

export interface ResolvedCode {
  /** The wallet the code belongs to, or null when it resolves to nothing. */
  address: string | null;
}

/**
 * What a code points at, without applying it.
 *
 * Used to validate as the user types, so a typo fails BEFORE a wallet prompt
 * rather than after one. Never throws: an unreachable service and an unknown
 * code both resolve to null, because neither should block the user from
 * carrying on.
 */
export async function resolveReferralCode(code: string): Promise<ResolvedCode> {
  try {
    const res = await fetch(`/referral/resolve/${encodeURIComponent(code.trim().toUpperCase())}`);
    if (!res.ok) return { address: null };
    const body = (await res.json()) as { address?: string };
    return { address: body.address ?? null };
  } catch {
    return { address: null };
  }
}
