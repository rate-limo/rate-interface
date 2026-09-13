import type { ReactNode } from "react";
import "../globals.css";

/**
 * A root layout for `/x/*`, which sits outside `[locale]`.
 *
 * Every other top-level entry in `app/` is a `route.ts` handler, so this is the
 * first PAGE here — and Next requires any page not under an existing root
 * layout to have one of its own, `<html>` and `<body>` included. Without it the
 * production build fails outright ("doesn't have a root layout"); dev does not
 * catch it.
 *
 * Kept deliberately bare. `/x/complete` is a popup the user sees for a moment
 * before it closes itself, so it wants the stylesheet — its copy reads against
 * the app's own surface colours — and nothing else. Pulling in the locale
 * layout's providers would start a wallet stack and a WebSocket inside a window
 * that is about to disappear, which is the cost this route exists to avoid.
 *
 * `lang` is hardcoded because there is no locale segment to read one from, and
 * a popup that closes on its own has no content worth negotiating.
 */
export default function XLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-neutral-dark-700">{children}</body>
    </html>
  );
}
