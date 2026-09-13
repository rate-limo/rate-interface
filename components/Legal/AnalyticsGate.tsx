"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { analyticsAllowed, useConsent } from "@/lib/consent/store";

/**
 * Vercel Analytics and Speed Insights, mounted only on an explicit accept.
 *
 * These used to render unconditionally in app/layout.tsx, which is what a
 * consent banner is supposed to prevent: a banner that appears while the
 * tracking script has already loaded is decoration, not consent. Gating at the
 * mount point means "reject" and "no answer yet" both result in the scripts
 * never being requested at all — not requested-then-ignored.
 *
 * Returns null during the pre-mount window too (`ready` is false), so the
 * server-rendered HTML and the first client render agree.
 */
export function AnalyticsGate() {
  const { record, ready } = useConsent();
  if (!ready || !analyticsAllowed(record ?? null)) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
