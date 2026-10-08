"use client";

import { useEffect, useState } from "react";

export interface LaunchAvailability {
  auction: boolean;
  fair: boolean;
}

/**
 * Which launch kinds the operator currently allows, per chain.
 *
 * `?chain=` is REQUIRED. `/launch-config` reads `landingContent`, which is per
 * chain on purpose, and the route handler resolves that chain's own
 * admin-service — see apps/web/CLAUDE.md, "One chain per request → a ROUTE
 * HANDLER, not a rewrite". Without the parameter one chain's venue
 * configuration was served on every chain's launch page.
 *
 * **Both default to true and stay true on any failure.** This gates a creator's
 * entry to the flow, so an unreachable optional config service must not look
 * like a disabled product: the contracts are permissionless, and the operator
 * flag is a presentation choice layered on top. The flow itself reverts on
 * chain if a kind is genuinely unavailable, which is the loud failure.
 *
 * Lives here rather than inside the page because the shell's `+ Create` button
 * and the `/create` route both need the same answer, and two copies of a fetch
 * is how they come to disagree about what an absent flag means.
 */
export function useLaunchAvailability(networkSlug: string): LaunchAvailability {
  const [availability, setAvailability] = useState<LaunchAvailability>({
    auction: true,
    fair: true,
  });

  useEffect(() => {
    let live = true;
    void fetch(`/launch-config?chain=${encodeURIComponent(networkSlug)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { auctionLaunchEnabled?: boolean; fairLaunchEnabled?: boolean } | null) => {
        if (!live || !config) return;
        setAvailability({
          auction: config.auctionLaunchEnabled !== false,
          fair: config.fairLaunchEnabled !== false,
        });
      })
      .catch(() => {
        // Keep both enabled if the optional config service is unavailable.
      });
    return () => {
      live = false;
    };
  }, [networkSlug]);

  return availability;
}
