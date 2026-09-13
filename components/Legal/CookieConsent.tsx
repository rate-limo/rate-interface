"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useConsent } from "@/lib/consent/store";

/**
 * Cookie consent banner.
 *
 * Design rules it follows, all of which are the difference between consent and
 * theatre:
 *
 *  - **Reject is as easy as accept.** Same size, same weight, side by side. A
 *    buried or greyed-out reject is the pattern regulators single out.
 *  - **Nothing loads until answered.** AnalyticsGate mounts the scripts, and it
 *    returns null for "no answer" as well as "rejected".
 *  - **It doesn't trap the page.** No modal, no focus trap, no scroll lock —
 *    declining by ignoring it leaves the user with a working site and no
 *    tracking, which is the correct default.
 *  - **Answerable again later** from /cookies, so this is not a one-shot.
 *
 * ## Where it sits
 *
 * **Bottom-right on desktop**, as a narrow card. A consent notice is an aside;
 * a wide centred bar reads as a modal the page is waiting on, which contradicts
 * the "doesn't trap the page" rule above.
 *
 * It clears the two things that own the bottom edge, and both matter:
 *
 *  - **Mobile tab bar** — `fixed`, also `z-50`, full width. The banner sits at
 *    `bottom-[76px]` above it, and stays FULL WIDTH under 1200px: a 400px card
 *    pushed into the corner of a 360px phone is narrower than the screen for no
 *    reason. Right-alignment is a desktop affordance.
 *  - **StatusBar** — `sticky bottom-0`, 40px, in-app only. The desktop offset is
 *    52px (40 + 12) rather than 12px, so a scrolled-to-the-end page does not
 *    have its price and gas chips covered. On the landing page, which has no
 *    StatusBar, this simply floats slightly higher.
 *
 * The one thing it cannot out-stack is Sonner: `/pool/new`, `/portfolio` and the
 * rewards claim view render toasts `position="bottom-right"` at
 * `z-index: 999999999`, so a toast paints over this card. Accepted, not
 * overlooked — that ordering is correct (a toast is transient and answers
 * something the user just did, while this waits indefinitely), and the overlap
 * needs a toast to fire during the seconds before consent is answered on a
 * first visit. If it ever reads badly, move this to bottom-LEFT rather than
 * fighting the z-index.
 */
export function CookieConsent() {
  const { record, ready, accept, reject } = useConsent();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const shown = ready && record === null;

  // Move focus to the banner when it appears so a keyboard user isn't left
  // tabbing through the whole page to reach it. Deliberately not a focus TRAP:
  // the page stays usable, and Escape is not needed to get out.
  useEffect(() => {
    if (shown) acceptRef.current?.focus({ preventScroll: true });
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      /* The support launcher measures this node to sit above it rather than
         hard-coding an offset that a copy change here would break. See
         components/Support/SupportWidget. */
      data-consent-banner=""
      className="fixed inset-x-2.5 bottom-[76px] z-50 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 p-4 shadow-2xl backdrop-blur-xl min-[1200px]:left-auto min-[1200px]:right-3 min-[1200px]:bottom-[52px] min-[1200px]:w-[380px]"
    >
      <p className="text-[13.5px] leading-snug text-[color:var(--m-text-secondary)]">
        <span className="font-semibold text-[color:var(--m-text-primary)]">
          We&apos;d like to measure how the app is used.
        </span>{" "}
        Analytics are off unless you turn them on. What the app needs to work — your theme, your
        chain, this choice — stays on either way.{" "}
        <Link
          href="/cookies"
          className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
        >
          What we store
        </Link>
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {/* Equal weight, equal size, reject first in the DOM so it is never the
            afterthought. */}
        <button
          type="button"
          data-testid="cookie-consent-reject"
          onClick={reject}
          className="flex-1 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-2.5 text-[13.5px] font-semibold text-[color:var(--m-text-primary)] hover:border-[color:var(--m-primary)]"
        >
          Only what&apos;s needed
        </button>
        <button
          ref={acceptRef}
          type="button"
          data-testid="cookie-consent-accept"
          onClick={accept}
          className="flex-1 rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)]"
        >
          Allow analytics
        </button>
      </div>
    </div>
  );
}
