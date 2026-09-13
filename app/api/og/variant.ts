/**
 * Picks which share card `/api/og` serves.
 *
 * Lives beside the route rather than inside it because Next only permits
 * its own known exports (`GET`, `dynamic`, ...) from a route handler --
 * exporting a helper from route.ts fails the build, so the logic sits
 * here where it can also be unit tested.
 */

// Matches the pre-paint theme script in app/layout.tsx: light during the
// day, dark at night. Change these together or the link preview stops
// agreeing with the page it links to.
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 19;

// The clock is the server's, not the viewer's -- a crawler's locale is
// unknowable -- so day and night are defined against one fixed zone.
export const REFERENCE_TIME_ZONE = "UTC";

export const VARIANT_FILES = {
  light: "opengraph-light.jpg",
  dark: "opengraph-dark.jpg",
} as const;

export type Variant = keyof typeof VARIANT_FILES;

export function variantForTime(now: Date = new Date()): Variant {
  // `hourCycle: "h23"` rather than `hour12: false` -- the latter reports
  // midnight as "24" under some ICU builds, which would flip the test.
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: REFERENCE_TIME_ZONE,
    }).format(now),
  );
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? "light" : "dark";
}
