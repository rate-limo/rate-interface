"use server";
import { PonderLinks } from "@/consts";

/**
 * Raw response of `GET /api/account/:address` — the profile header's data
 * source. Kept as `Record<string, unknown>` at this layer (same convention as
 * `getCreatorTokens`) because normalization into `AccountProfile` belongs to
 * `lib/portfolio/profile.ts`, which is pure and testable; a server action
 * cannot be unit tested the way a plain function can.
 *
 * Never throws. A profile-header read failing must not blank the rest of the
 * portfolio page — same rule as `getPoints`/`getCreatorTokens` — so a bad
 * response or network error degrades to `null` and the caller renders the
 * address-derived fallback.
 */
export async function getAccountProfile(
  networkName: string,
  address: string,
): Promise<Record<string, unknown> | null> {
  const base = PonderLinks[networkName];
  if (!base || !address) return null;
  const url = `${base}/api/account/${encodeURIComponent(address)}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getAccountProfile: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    console.warn(`getAccountProfile: request failed for ${url}`, error);
    return null;
  }
}

/**
 * Raw response of `GET /api/account/:address/positions` — cost basis, live
 * value and PnL per token. Same convention as `getAccountProfile`: raw at this
 * layer, normalized by `lib/portfolio/positions.ts`, and never throwing, so a
 * failed read costs the Positions tab its rows and nothing else on the page.
 *
 * `revalidate: 0` is not incidental. The route is classified `private` in the
 * gateway's own cache rules precisely because it is per-wallet cost basis; a
 * cached answer here is one wallet's positions served to whoever asks next.
 */
export async function getAccountPositions(
  networkName: string,
  address: string,
): Promise<Record<string, unknown> | null> {
  const base = PonderLinks[networkName];
  if (!base || !address) return null;
  const url = `${base}/api/account/${encodeURIComponent(address)}/positions`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getAccountPositions: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    console.warn(`getAccountPositions: request failed for ${url}`, error);
    return null;
  }
}
