import { PonderLinks, slugToNetworkName, supportedChains } from "@/consts";
import type { RateCardKey } from "./share";

/**
 * What became of the order a rate card names, read from the chain's gateway.
 *
 *   waiting — it is resting on the book now
 *   filled  — order history says the book cleared it
 *   unknown — anything else: cancelled, not found, or the gateway did not answer
 *
 * `unknown` is not an error. A card for it says "Set your rate" and nothing
 * specific, which is still true. What it must never do is guess: a card that
 * says "filled" for an order that was cancelled is a false claim with the
 * sharer's name on it.
 */
export type RateCardOrder = {
  state: "waiting" | "filled";
  price: number;
  baseSymbol: string;
  quoteSymbol: string;
  network: string;
};
export type RateCardResolution = RateCardOrder | { state: "unknown"; network: string | null };

const TIMEOUT_MS = 2500;
const PAGE = 100;

type Row = Record<string, unknown>;

/** The order history nests base/quote as objects; open orders flatten them. Read both. */
function symbolOf(row: Row, side: "base" | "quote"): string | null {
  const flat = row[`${side}Symbol`];
  if (typeof flat === "string" && flat) return flat;
  const nested = row[side];
  if (nested && typeof nested === "object" && typeof (nested as Row).symbol === "string") return (nested as Row).symbol as string;
  return null;
}

function matches(row: Row, key: RateCardKey): boolean {
  return (
    typeof row.pair === "string" &&
    row.pair.toLowerCase() === key.pair.toLowerCase() &&
    Boolean(row.isBid) === (key.side === "buy") &&
    // A crossed history row has no id of its own (`rested: false`, orderId
    // null), so it can never be the order a card names.
    row.rested !== false &&
    row.orderId !== null &&
    row.orderId !== undefined &&
    Number(row.orderId) === key.orderId
  );
}

async function rows(url: string, field: string): Promise<Row[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as Record<string, unknown>;
  return Array.isArray(body[field]) ? (body[field] as Row[]) : [];
}

function toOrder(row: Row, state: RateCardOrder["state"], network: string): RateCardOrder | null {
  const price = Number(row.price);
  const baseSymbol = symbolOf(row, "base");
  const quoteSymbol = symbolOf(row, "quote");
  if (!Number.isFinite(price) || price <= 0 || !baseSymbol || !quoteSymbol) return null;
  return { state, price, baseSymbol, quoteSymbol, network };
}

export async function resolveRateCard(key: RateCardKey): Promise<RateCardResolution> {
  const network = slugToNetworkName[key.chain];
  const base = network && supportedChains.includes(network) ? PonderLinks[network] : undefined;
  if (!network || !base) return { state: "unknown", network: null };
  const owner = key.address.toLowerCase();
  try {
    const [open, history] = await Promise.all([
      rows(`${base}/api/orders/${owner}/${PAGE}/1`, "orders"),
      rows(`${base}/api/orderhistory/${owner}/${PAGE}/1`, "orderHistories"),
    ]);
    const resting = open.find((r) => matches(r, key));
    if (resting) return toOrder(resting, "waiting", network) ?? { state: "unknown", network };
    const done = history.find((r) => matches(r, key) && r.status === "filled");
    if (done) return toOrder(done, "filled", network) ?? { state: "unknown", network };
  } catch {
    // An unreachable gateway is "unknown", never a 500: a card that errors
    // unfurls as nothing at all.
  }
  return { state: "unknown", network };
}
