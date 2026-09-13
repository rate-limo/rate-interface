"use server";
import { PonderLinks } from "@/consts";

/**
 * Raw response of `GET /api/token/:address/traders/:pageSize/:page`.
 *
 * ## These are traders, not holders, and the difference is not cosmetic
 *
 * Nothing in this system indexes ERC-20 `Transfer`, so there is no wallet
 * balance anywhere to read. Each row is a position folded from the FILL LEDGER
 * (`broker.spotPositions`), which means:
 *
 *  - a wallet that received the token by airdrop, transfer or LP withdrawal and
 *    never traded does not appear at all;
 *  - a wallet that bought and then sent the tokens elsewhere still does.
 *
 * `pctSupply` is therefore the share of supply a TRADED position represents. It
 * understates in aggregate and the column does not sum to 100%. The gateway
 * repeats this in `basis` on every response so a caller cannot render it as a
 * holder distribution by accident; the panel surfaces it to the reader.
 *
 * Never throws — a failed read must not blank the token profile, same rule as
 * `getTokenStats`.
 */
export interface TokenTrader {
  account: string;
  /** Display handle, already resolved from the profile; null when unclaimed. */
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Ledger-tracked amount, NOT the wallet balance. */
  amount: number;
  /** null when the token has no price — not 0. */
  valueUSD: number | null;
  costUSD: number;
  avgEntryUSD: number;
  /** A ledger fact: proceeds already booked. */
  realizedPnlUSD: number;
  /** Depends on the live price, so null when unpriced. Deliberately kept apart
   *  from realised — summing them yields a number that is silently part guess. */
  unrealizedPnlUSD: number | null;
  /** Sold without a recorded buy — the tell for tokens that arrived off-ledger. */
  untrackedSold: number;
  pctSupply: number | null;
  tradeCount: number;
  lastTradeAt: number | null;
  priced: boolean;
  /** Whether `viewer` follows this trader. `null` when no viewer was supplied —
   *  distinct from `false`, which means "asked, and they do not". */
  followedByViewer: boolean | null;
}

export interface TokenTradersResponse {
  token: string;
  traders: TokenTrader[];
  totalCount: number;
  pageSize: number;
  page: number;
  priceUSD: number | null;
  totalSupply: number | null;
  /** e.g. "fill-ledger positions, not wallet balances". */
  basis: string;
}

export async function getTokenTraders(
  networkName: string,
  address: string,
  pageSize = 25,
  page = 1,
  /** Connected wallet, when there is one. Drives the panel's Following tab. */
  viewer?: string,
): Promise<TokenTradersResponse | null> {
  const base = PonderLinks[networkName];
  if (!base || !address) return null;
  const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
  const url = `${base}/api/token/${encodeURIComponent(address)}/traders/${pageSize}/${page}${query}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getTokenTraders: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as TokenTradersResponse;
  } catch (error) {
    console.warn(`getTokenTraders: request failed for ${url}`, error);
    return null;
  }
}
