"use server";
import { PonderLinks } from "@/consts";

/**
 * Raw response of `GET /api/token/:address/bubbles`.
 *
 * ## These ARE balances, unlike TokenTrader
 *
 * `tokenBalances` is folded from the coin's ERC-20 `Transfer` log since its
 * deploy block, which reconstructs balances exactly — a token's whole supply
 * history IS its transfer log. So a wallet that was airdropped the coin appears
 * here and does NOT appear in `/traders`, which only ever sees fills.
 *
 * The two disagreeing is the interesting part, not a bug: a large holder with no
 * trading position never bought.
 *
 * ## `covered` is not the same as "no holders"
 *
 * Balances come from a ponder factory source over `AssetGenerator.Launched`, so
 * only coins that factory deployed have rows. For ETH, USDC and other listed
 * tokens the answer is "not covered", which must be shown as an explanation
 * rather than as an empty map.
 */
export interface BubbleNode {
  account: string;
  handle: string | null;
  balance: number;
  pctSupply: number | null;
  valueUSD: number | null;
  transferCount: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  /** The mint source / burn sink. Its balance is negative; never size a bubble by it. */
  isZeroAddress: boolean;
  /**
   * The wallet that launched this coin — `spotTokens.creator`, written by the
   * broker from `Launched`. The one node on the map a reader most needs told
   * apart: it usually holds most of the supply, and an unlabelled 99% bubble is
   * indistinguishable from a whale who bought in.
   */
  isCreator?: boolean;
  /**
   * An ORDERBOOK, not a person. A pair contract escrows the base tokens behind
   * every resting ask, so it holds a large balance and sits at the end of nearly
   * every transfer edge. Unmarked it reads as the graph's biggest actor, which
   * inverts the conclusion the map exists to support.
   */
  isMarket?: boolean;
}

export interface BubbleEdge {
  from: string;
  to: string;
  value: number;
  transferCount: number;
  lastAt: number | null;
}

export interface TokenBubblesResponse {
  token: string;
  nodes: BubbleNode[];
  edges: BubbleEdge[];
  totalSupply: number | null;
  priceUSD: number | null;
  limit: number;
  /** False when this token is not a launched coin, so there is nothing to cover. */
  covered: boolean;
  /** The launching wallet as stored, or null for a token the generator did not
   *  deploy. Present so a caller can name the creator without scanning nodes. */
  creator?: string | null;
  basis: string;
}

export async function getTokenBubbles(
  networkName: string,
  address: string,
  limit = 50,
): Promise<TokenBubblesResponse | null> {
  const base = PonderLinks[networkName];
  if (!base || !address) return null;
  const url = `${base}/api/token/${encodeURIComponent(address)}/bubbles?limit=${limit}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getTokenBubbles: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as TokenBubblesResponse;
  } catch (error) {
    console.warn(`getTokenBubbles: request failed for ${url}`, error);
    return null;
  }
}
