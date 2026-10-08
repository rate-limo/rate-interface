import { wagmiChains } from "../customChains";
import {
  AggregatorLink,
  PonderFuturesLinks,
  PonderFuturesWssLinks,
  PonderLinks,
  PonderWssLinks,
} from "../../consts";

/**
 * Every origin the app's browser code connects to directly, for the CSP's
 * `connect-src`.
 *
 * Read from the SAME constants the app calls, never from the env overrides
 * alone. The aggregator was listed as `process.env.NEXT_PUBLIC_AGGREGATOR_URL`,
 * but the app reaches it through `AggregatorLink`, which falls back to the
 * production URL when that variable is unset — as it is in production. So the
 * report-only policy flagged every Explore, token-list and cross-chain request
 * (seen in WebKit's console on /trade/pro), and promoting it to enforcing would
 * have blocked them all. A constant the app uses and a list the policy reads
 * have to be the same value, or they drift exactly like this.
 */
export function appConnectOrigins(): string[] {
  const raw = [
    ...Object.values(PonderLinks),
    ...Object.values(PonderWssLinks),
    ...Object.values(PonderFuturesLinks),
    ...Object.values(PonderFuturesWssLinks),
    ...wagmiChains.flatMap((chain) => chain.rpcUrls.default.http),
    AggregatorLink,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_WS_URL,
    process.env.NEXT_PUBLIC_FUTURES_API_URL,
    process.env.NEXT_PUBLIC_FUTURES_WS_URL,
  ];
  const out = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !value) continue;
    try {
      out.add(new URL(value).origin);
    } catch {
      // A relative or malformed entry has no origin to allow.
    }
  }
  return Array.from(out);
}
