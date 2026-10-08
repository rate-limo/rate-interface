/**
 * How Pro's URL names a market's two tokens.
 *
 * `/trade/pro?base=&quote=` took SYMBOLS, and the launchpad deliberately allows
 * two coins to share one — so `base=NOVA` named whichever NOVA the gateway's
 * symbol route happened to return first, and every picker, table row and tape
 * link could open the wrong market. Links now carry the token ADDRESSES, which a
 * base+quote pair maps to exactly one book (`/api/pair/:base/:quote`).
 *
 * Symbols are still accepted, so links already shared keep working while their
 * ticker is unique.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** True when a `base`/`quote` value is a token address rather than a symbol. */
export function isTokenAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && ADDRESS.test(value);
}

/**
 * The value to put in `base=`/`quote=` for a token: its address when the caller
 * has one, else its symbol. Accepts the shapes the app's rows carry (`id` on
 * gateway token rows, `address` on token-list rows).
 */
export function marketParam(token: {
  id?: string | null;
  address?: string | null;
  symbol?: string | null;
}): string {
  if (isTokenAddress(token.id)) return token.id;
  if (isTokenAddress(token.address)) return token.address;
  return token.symbol ?? "";
}
