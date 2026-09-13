/**
 * The portfolio's tab identity, in a module with NO `"use client"` — which is the
 * whole reason this file exists separately from `ActivityTabs`.
 *
 * `app/[locale]/portfolio/page.tsx` is a server component and reads `?tab=` from
 * `searchParams` rather than through `useSearchParams`, which would opt the page out
 * of static rendering unless it were Suspense-wrapped. That means it CALLS
 * `sectionFromParam` on the server. While that function lived in `ActivityTabs` —
 * a client module — the import handed the server a client reference instead of a
 * function, and Next 16.3.3 says so:
 *
 *   Attempted to call sectionFromParam() from the server but sectionFromParam is on
 *   the client. It's not possible to invoke a client function from the server.
 *
 * The pattern was never valid; enforcement is what changed. So the rule is: a helper
 * both sides call does not live behind `"use client"`. `ActivityTabs` re-exports the
 * TYPE for its own consumers — types are erased and cross the boundary freely — but
 * the function must be imported from here.
 */

export type SectionKey =
  | "assets"
  | "positions"
  | "orders"
  | "stopOrders"
  | "lps"
  | "trades"
  | "history"
  | "rewards"
  | "referrals"
  | "creator";

/**
 * Resolve `?tab=` to a section.
 *
 * Deliberately a whitelist rather than a cast: this reads a URL, and a `?tab=`
 * nobody implemented should open the default tab, never a blank panel.
 */
export function sectionFromParam(value: unknown): SectionKey | undefined {
  const keys: SectionKey[] = [
    "positions", "orders", "stopOrders", "lps", "trades",
    "history", "rewards", "referrals", "creator",
  ];
  return typeof value === "string" && (keys as string[]).includes(value)
    ? (value as SectionKey)
    : undefined;
}
