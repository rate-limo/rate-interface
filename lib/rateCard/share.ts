/**
 * The "my rate" card: a resting order, shared as the price someone is waiting for.
 *
 * It is the product's answer to its own line. "Don't trade" means set a rate
 * and walk away, and the card is what a person shows instead of a trade: the
 * price they are waiting for, and later, that it filled there.
 *
 * Everything here is pure and origin-injected, like `lib/profile/share`.
 *
 * ## What the link names, and what it deliberately does not
 *
 * The link and the card name an ORDER — chain, owner, order book, side, id —
 * and never its numbers. `/api/og/rate` reads the numbers from the gateway, so
 * nobody can share "I bought at the bottom" by editing a query string: a card
 * either describes an order that exists on chain, or it says nothing specific.
 *
 * Size is never on the card. The point is the PRICE someone is waiting for; how
 * much they put behind it is theirs, and a size invites exactly the "look what
 * I made" post the brand rules out.
 */
import { formatRate } from "@/lib/liquidity/rate";

export type RateSide = "buy" | "sell";

/** Which order a card is about. All of it is public on chain already. */
export interface RateCardKey {
  chain: string; // chain slug, e.g. "rise-testnet"
  address: string; // the order's owner
  pair: string; // the order book
  side: RateSide;
  orderId: number;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SLUG = /^[a-z0-9-]{1,40}$/;

export function sideOf(isBid: boolean): RateSide {
  return isBid ? "buy" : "sell";
}

function query(key: RateCardKey): URLSearchParams {
  return new URLSearchParams({
    chain: key.chain,
    address: key.address,
    pair: key.pair,
    side: key.side,
    order: String(key.orderId),
  });
}

/**
 * Parses a key out of search params, refusing anything malformed. The values
 * reach a gateway URL path, so the shapes are checked, not trusted.
 */
export function parseRateCardKey(params: URLSearchParams | Record<string, string | undefined>): RateCardKey | null {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? "";
  const chain = get("chain");
  const address = get("address");
  const pair = get("pair");
  const side = get("side");
  const orderId = Number(get("order"));
  if (!SLUG.test(chain) || !ADDRESS.test(address) || !ADDRESS.test(pair)) return null;
  if (side !== "buy" && side !== "sell") return null;
  // Engine ids start at 1. `order=0` names no order — and `Number(null)` is 0,
  // so accepting it would match a crossed history row, which has no id.
  if (!Number.isSafeInteger(orderId) || orderId < 1) return null;
  return { chain, address, pair, side, orderId };
}

/**
 * The link someone shares. Carries the sharer's referral code when they have
 * one, so a click that becomes a first order credits them — the card is a
 * referral link that happens to say something.
 */
export function rateShareUrl(origin: string, key: RateCardKey, refCode?: string | null): string {
  const q = query(key);
  if (refCode) q.set("ref", refCode);
  return `${origin.replace(/\/$/, "")}/rate?${q.toString()}`;
}

/** The 1200×630 image — the same route the share page hands to crawlers. */
export function rateCardUrl(origin: string, key: RateCardKey): string {
  return `${origin.replace(/\/$/, "")}/api/og/rate?${query(key).toString()}`;
}

/** `1 ETH = 1,500 USDC` — quote per base, never a dollar figure. */
export function rateLine(price: number, baseSymbol: string, quoteSymbol: string): string {
  return `1 ${baseSymbol} = ${formatRate(price)} ${quoteSymbol}`;
}

/** The post text. States the price and the line; never a size or a gain. */
export function rateShareText(side: RateSide, price: number, baseSymbol: string, quoteSymbol: string, filled = false): string {
  const verb = side === "buy" ? "buy" : "sell";
  const lead = filled
    ? `Filled at my rate: ${rateLine(price, baseSymbol, quoteSymbol)}.`
    : `My rate: I'd ${verb} ${baseSymbol} at ${rateLine(price, baseSymbol, quoteSymbol)}.`;
  return `${lead} Don't trade. Let the market come to you.`;
}
