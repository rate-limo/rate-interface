/**
 * The profile's tab identity, in a module with NO `"use client"` — which is the
 * whole reason this file is separate from `ProfileView`.
 *
 * `app/[locale]/profile/[address]/page.tsx` is a server component and reads
 * `?tab=` from `searchParams` rather than through `useSearchParams` (which would
 * opt the page out of static rendering unless it were Suspense-wrapped). So it
 * CALLS `sectionFromParam` on the server, and Next 16.3.3 refuses to let a
 * server component invoke a function exported from a client module:
 *
 *   Attempted to call sectionFromParam() from the server but sectionFromParam is
 *   on the client. It's not possible to invoke a client function from the server.
 *
 * `components/Portfolio/section.ts` exists for exactly this and documents the
 * same failure. The rule: a helper both sides call does not live behind
 * `"use client"`. Types are erased and cross the boundary freely, so
 * `ProfileView` re-exports the TYPE for its own consumers; the FUNCTION must be
 * imported from here.
 */

export type ProfileSection = "open" | "closed" | "coins" | "rewards" | "replies" | "activity";

/**
 * Resolve `?tab=` to a section.
 *
 * A whitelist rather than a cast, for the same reason the portfolio's is: this
 * reads a URL, and a `?tab=` nobody implemented should open the default tab,
 * never a blank panel.
 */
export function sectionFromParam(value: unknown): ProfileSection | undefined {
  const keys: ProfileSection[] = ["open", "closed", "coins", "rewards", "replies", "activity"];
  return typeof value === "string" && (keys as string[]).includes(value)
    ? (value as ProfileSection)
    : undefined;
}
