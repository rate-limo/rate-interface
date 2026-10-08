/**
 * An affiliate application, as the support ticket it is filed as.
 *
 * The first line is a fixed heading so the operator's /support queue can tell an
 * application from a support request at a glance; everything after it is what
 * the applicant typed, labelled, and never interpreted.
 */

import { isAddress } from "viem";
import { referralShareLink } from "@/lib/referral/share";

/** X's own handle rule: 1–15 letters, digits or underscores. Null when it is not one. */
export function normaliseXHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?#]/)[0] ?? "";
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

/**
 * The link the applicant asks for — `iter.cx/r/<CODE>` — checked against the
 * SHAPE admin-service's `isValidVanityCode` enforces when an operator assigns
 * it: 3–12 letters and digits, starting with a letter, never the 6-hex shape of
 * an automatic code. A hint for the applicant, not the gate: the operator's
 * assignment re-validates (and applies the reserved-word list), so a request
 * that passes here can still be declined there.
 */
export function requestedCodeProblem(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{2,11}$/.test(code)) return "3–12 letters and digits, starting with a letter.";
  if (/^[0-9A-F]{6}$/.test(code)) return "That looks like an automatic code. Pick something else.";
  return null;
}

export const APPLICATION_HEADING = "Affiliate application";

export function affiliateApplicationMessage(input: {
  wallet: string;
  requestedCode: string;
  xHandle: string | null;
  audience: string;
}): string {
  const lines = [
    APPLICATION_HEADING,
    `Wallet: ${input.wallet}`,
    `Requested link: ${referralShareLink(input.requestedCode)}`,
    `X: ${input.xHandle ? `@${input.xHandle}` : "—"}`,
  ];
  const audience = input.audience.trim();
  if (audience) lines.push("", "Audience:", audience.slice(0, 1000));
  return lines.join("\n");
}

/** A vanity code is assigned to a wallet, so an application without one cannot be acted on. */
export function isApplicantWallet(raw: string): boolean {
  return isAddress(raw.trim(), { strict: false });
}
