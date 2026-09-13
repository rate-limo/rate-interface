/**
 * Whether a search hit is a pre-graduation market.
 *
 * Search is ungated ON PURPOSE — `apps/gateway/src/api/routeCoverage.test.ts`
 * pins it as an identity lookup that "must keep resolving regardless of
 * verified" — so unlisted tokens and pairs have always come back from it. What
 * was missing is that nothing SAID so: they sorted in among listed results as
 * equals, with no way for a reader to tell an Iter-listed market from one
 * deployed ten minutes ago by anyone.
 *
 * Anything other than an explicit `true` counts as unlisted. `verified` is
 * nullable, defaults to false, and is absent entirely from an older gateway;
 * the safe reading of "unknown" is "not listed", because the opposite default
 * would silently present an unreviewed market as a reviewed one.
 *
 * Lives here rather than beside the types in queries/server/search.ts because
 * that module is `"use server"` and may only export async functions.
 */
export function isUnlisted(hit: { verified?: boolean | null }): boolean {
  return hit.verified !== true;
}

/** Split hits into the listed ones and the pre-graduation ones, preserving the
 * server's ordering within each group. Unlisted results are rendered last and
 * under their own heading — reachable, never ranked alongside. */
export function partitionByListing<T extends { verified?: boolean | null }>(
  hits: T[],
): { listed: T[]; unlisted: T[] } {
  return {
    listed: hits.filter((h) => !isUnlisted(h)),
    unlisted: hits.filter((h) => isUnlisted(h)),
  };
}
