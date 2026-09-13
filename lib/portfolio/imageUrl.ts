import { PonderLinks } from "@/consts";

/**
 * Absolutise a profile image path served by a chain's gateway.
 *
 * ## Why this is not in `lib/portfolio/profile.ts`
 *
 * That module is `"use client"`, and this function has a SERVER caller:
 * `app/api/og/profile/route.tsx` runs on Node and builds the share card, where an
 * avatar has to be an absolute url because Satori renders outside a document and
 * has no origin to resolve a path against.
 *
 * Calling it there while it lived in the client module threw at request time —
 * *"Attempted to call profileImageUrl() from the server but profileImageUrl is on
 * the client"* — which 500'd the entire card. That is strictly worse than the bug
 * it was added to fix: an avatar that failed to render became no card at all, on
 * a route whose failures are invisible because crawlers are the usual caller.
 *
 * So it lives in its own module with no directive, importable from both sides.
 * `profile.ts` re-exports it, which keeps every existing client import working.
 *
 * A value that is already absolute passes through untouched; an unknown network
 * yields null rather than a half-built url, because a broken `src` and a missing
 * one look the same to a reader and only one of them is honest.
 */
export function profileImageUrl(networkName: string, path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = PonderLinks[networkName];
  if (!base) return null;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
