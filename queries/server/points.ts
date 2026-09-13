import type { PublicPoints } from "@/lib/portfolio/rewards";
import { EMPTY_POINTS } from "@/lib/portfolio/rewards";

/**
 * A wallet's own points from admin-service's PUBLIC `/points/:address`.
 *
 * Rewritten same-origin in `next.config.ts` (and excluded in `proxy.ts`, or
 * i18n prefixes the path and it 404s while looking correct). The operator route
 * `/api/point/wallet` answers a superset but needs `x-admin-key`, which this
 * app has no business holding.
 *
 * Never throws. A rewards panel that blanks the whole portfolio because one
 * read failed is the trade-banner mistake, and `EMPTY_POINTS` renders zeros —
 * which for points is honest: the table's absence of rows IS zero points.
 */
export async function getPoints(address: string): Promise<PublicPoints> {
  if (!address) return EMPTY_POINTS;
  try {
    const res = await fetch(`/points/${encodeURIComponent(address)}`, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`getPoints: ${res.status} for ${address}`);
      return EMPTY_POINTS;
    }
    return (await res.json()) as PublicPoints;
  } catch (error) {
    console.warn("getPoints: request failed", error);
    return EMPTY_POINTS;
  }
}
