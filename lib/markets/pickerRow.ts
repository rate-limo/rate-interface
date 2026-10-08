/**
 * One row of Pro's market picker, derived from a gateway pair.
 *
 * Pure and separate from the component because every rule here is a claim
 * about a market that a reader will act on — which side of the book they are
 * committing to, and whether anyone has reviewed it.
 */
import { marketParam } from "@/lib/routing/proMarket";
import { isUnlisted } from "@/lib/search/listing";
import type { SpotPair } from "@/types";

export interface PickerRow {
  id: string;
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  /** Token addresses. Pro links name a market by these: a launchpad ticker can belong to two coins. */
  baseAddress?: string;
  quoteAddress?: string;
  /**
   * Both tokens' artwork, so a row can draw the PAIR rather than one leg of it.
   *
   * These were dropped on the floor here while `useAllPairs` had them on every
   * `SpotPair`, which is why the picker hardcoded `logoURI={undefined}` and
   * rendered every market in the list as hued initials — artwork the operator had
   * uploaded, present in the payload, discarded one function before the render.
   *
   * Optional because a token genuinely may have none; the mark falls back to
   * `tokenColor`'s hue, which is what the rest of the app does.
   */
  baseLogoURI?: string;
  quoteLogoURI?: string;
  price: number | null;
  changePct: number | null;
  /** 24h volume in USD, counting BOTH legs — see `volumeUsd` below. */
  volumeUsd: number | null;
  quoteTvlUsd: number | null;
  /** Anything other than an explicit `verified: true`. */
  unlisted: boolean;
  /**
   * When the market was opened, unix seconds. With the base address this is
   * what tells two PEPE/USDC markets apart in a list, at a glance.
   */
  listedAt?: number | null;
}

/** A figure worth printing: finite, and greater than zero. Everything else is
 * an em-dash at the render site, never `$0` — a zero has to mean zero. */
function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 24h volume as the TERMINAL reports it.
 *
 * `PairPriceTracker` and `SpotPairTable` both render `dayQuoteVolumeUSD * 2`,
 * counting both legs of a fill — a $10 trade reports $20, and that is
 * deliberate, not a bug to correct here. The picker sits one click from those
 * surfaces, so a row that halved the figure would have the same market
 * reporting two volumes on one screen.
 */
export function volumeUsd(pair: Pick<SpotPair, "dayQuoteVolumeUSD">): number | null {
  const raw = positive(pair.dayQuoteVolumeUSD);
  return raw === null ? null : raw * 2;
}

/**
 * Quote-side TVL, and it must stay quote-side.
 *
 * This is the column that separates two markets with the same symbol, so it
 * has to be the half that costs something to fake. The base side of a launch
 * is the creator's own seeded mint — the stated reason graduation counts quote
 * liquidity only, since counting the base would let anyone list anything.
 */
export function quoteTvlUsd(pair: Pick<SpotPair, "dayQuoteTvlUSD">): number | null {
  return positive(pair.dayQuoteTvlUSD);
}

/** A pair's token as an address: an object with `id` on most routes, a bare address on some. */
function tokenAddress(token: unknown): string | undefined {
  if (typeof token === "string") return token || undefined;
  const id = (token as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && id ? id : undefined;
}

export function toPickerRow(pair: SpotPair): PickerRow {
  return {
    id: pair.id,
    symbol: pair.symbol,
    baseSymbol: pair.base?.symbol ?? pair.baseSymbol ?? "",
    quoteSymbol: pair.quote?.symbol ?? pair.quoteSymbol ?? "",
    baseAddress: tokenAddress(pair.base),
    quoteAddress: tokenAddress(pair.quote),
    // Empty string is not artwork. `logoURI` is non-nullable on the wire and
    // routinely blank, and an `<img src="">` re-requests the page itself — so it
    // is normalised to undefined here rather than at four render sites.
    baseLogoURI: pair.base?.logoURI || undefined,
    quoteLogoURI: pair.quote?.logoURI || undefined,
    price: positive(pair.price),
    // NOT `positive`: a real 0.00% is information — the market has not moved —
    // and a market down 4% must not render as an em-dash. Only a non-number is
    // unknown here.
    changePct: Number.isFinite(Number(pair.dayPriceDifferencePercentage))
      ? Number(pair.dayPriceDifferencePercentage)
      : null,
    volumeUsd: volumeUsd(pair),
    quoteTvlUsd: quoteTvlUsd(pair),
    // Shared with the ⌘K modal rather than reimplemented. A reader who follows
    // a market from one surface to the other must not be told two different
    // things about whether it is listed.
    //
    // Note this reads the RAW field and does not default it to true the way
    // `pairToResult` does. That default is correct there, where rows come from
    // the gated routes and are listed by construction; applied to these rows it
    // would stamp "Listed" on every unreviewed market on the chain.
    unlisted: isUnlisted(pair),
    listedAt: positive(pair.listingDate),
  };
}

/** `0x9a41…c07e` — enough of an address to tell two rows apart, not to trust. */
export function shortAddress(address: string | undefined): string | null {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** "3h", "4d", "2mo" since `listedAt`; null when unknown. */
export function ageLabel(listedAt: number | null | undefined, nowSeconds: number): string | null {
  if (!listedAt || listedAt <= 0) return null;
  const s = Math.max(0, nowSeconds - listedAt);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 86_400 * 60) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (86_400 * 30))}mo`;
}

/**
 * The market's own chain badge initials, e.g. "RISE Testnet" -> "RT".
 *
 * Matches `ChainBadge`'s rule so a row's network mark reads the same here as
 * it does everywhere else in the app.
 */
export function chainInitials(networkName: string): string {
  return networkName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The Pro link for a picker row: the two TOKEN ADDRESSES, so two launches that
 * share a ticker open two different markets. Symbols only when a row has no
 * address. See lib/routing/proMarket.ts.
 */
export function proHref(slug: string, row: Pick<PickerRow, "baseSymbol" | "quoteSymbol" | "baseAddress" | "quoteAddress">): string {
  const base = marketParam({ id: row.baseAddress, symbol: row.baseSymbol });
  const quote = marketParam({ id: row.quoteAddress, symbol: row.quoteSymbol });
  return `/trade/pro?chain=${slug}&base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`;
}
