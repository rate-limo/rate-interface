import {
  PonderLinks, PonderWssLinks, PonderFuturesLinks, PonderFuturesWssLinks,
} from "@/consts";

/** Per-network map is authoritative for a recognized network; the global env override is
 * only a dev/single-chain escape hatch, honored solely when the network isn't in the map
 * (so an existing single-chain deploy that sets NEXT_PUBLIC_WS_URL keeps working, but a
 * recognized multi-chain network always routes to its own gateway). */
export function getWsUrl(networkName: string): string {
  return PonderWssLinks[networkName] ?? process.env.NEXT_PUBLIC_WS_URL ?? "";
}
export function getApiUrl(networkName: string): string {
  return PonderLinks[networkName] ?? process.env.NEXT_PUBLIC_API_URL ?? "";
}
export function getFuturesWsUrl(networkName: string): string {
  return PonderFuturesWssLinks[networkName] ?? process.env.NEXT_PUBLIC_FUTURES_WS_URL ?? "";
}
export function getFuturesApiUrl(networkName: string): string {
  return PonderFuturesLinks[networkName] ?? process.env.NEXT_PUBLIC_FUTURES_API_URL ?? "";
}
