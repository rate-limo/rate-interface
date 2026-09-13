import { getAddress, isAddress } from "viem";

/**
 * The Wallets tab of the search modal is an address RESOLVER, not a search.
 *
 * `/api/search` queries `spotTokens` and `spotPairs` only — there is no account
 * index anywhere in the monorepo, and no ENS resolution either. So a wallet hit
 * cannot be *found*; it can only be *recognised*. A query that is a well-formed
 * address resolves to exactly one hit, locally, with no network call; anything
 * else produces none.
 *
 * That is the same shape Uniswap's wallet tab has (theirs adds ENS/unitags on
 * top, which is a real backend project here, not a UI change). Saying it plainly
 * matters: a tab that promised name search would be promising an index that does
 * not exist, and would look broken for every query that isn't an address.
 */

/** Whether the typed query is a well-formed EVM address, checksummed or not. */
export function isAddressQuery(raw: string): boolean {
  // strict:false so a lowercase or all-caps paste still counts — a user pasting
  // from a block explorer or a terminal should not be told their own address
  // isn't one. The checksum is APPLIED below rather than demanded here.
  return isAddress(raw.trim(), { strict: false });
}

/**
 * The EIP-55 checksummed form of a typed address, or null when it isn't one.
 *
 * Display is always checksummed: a lowercased address is valid input but a lossy
 * rendering, and echoing back exactly what was pasted would make the modal the
 * one place in the app that shows an unchecksummed address.
 */
export function toChecksumAddress(raw: string): `0x${string}` | null {
  const trimmed = raw.trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  try {
    return getAddress(trimmed);
  } catch {
    // Unreachable given the guard above, but getAddress throws rather than
    // returning null and a search modal must never take the page down.
    return null;
  }
}

/**
 * `0xA3f5…9a61` — for UI only.
 *
 * Never truncate an address anywhere it will be copied, signed, or sent. The
 * full checksummed value stays on the result item and is what the row's link and
 * clipboard action use; this is purely what fits in a row.
 */
export function truncateAddress(address: string, lead: number = 6, tail: number = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * Two addresses naming the same account.
 *
 * Case-insensitive because the two sides come from different places — one typed
 * by a human, one from wagmi — and only one of them is guaranteed checksummed.
 * A `===` here silently fails to recognise the user's own wallet, which is the
 * single case where the Wallets tab has a real destination to offer.
 */
export function isSameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
