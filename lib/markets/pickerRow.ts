/**
 * One row of Pro's market picker, derived from a gateway pair.
 *
 * Pure and separate from the component because every rule here is a claim
 * about a market that a reader will act on — which side of the book they are
 * committing to, and whether anyone has reviewed it.
 */
import { isUnlisted } from "@/lib/search/listing";
import type { SpotPair } from "@/types";

export interface PickerRow {
  id: string;
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  price: number | null;
  changePct: number | null;
  /** 24h volume in USD, counting BOTH legs — see `volumeUsd` below. */
  volumeUsd: number | null;
  quoteTvlUsd: number | null;
  /** Anything other than an explicit `verified: true`. */
  unlisted: boolean;
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

export function toPickerRow(pair: SpotPair): PickerRow {
  return {
    id: pair.id,
    symbol: pair.symbol,
    baseSymbol: pair.base?.symbol ?? pair.baseSymbol ?? "",
    quoteSymbol: pair.quote?.symbol ?? pair.quoteSymbol ?? "",
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
  };
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
