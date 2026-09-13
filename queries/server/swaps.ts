"use server";
import { getAddress } from "viem";
import { PonderLinks } from "@/consts";

/**
 * Router swap history — one row per `SwapExecuted`, the whole route.
 *
 * The gateway route has existed and served since the swaps indexer landed, and
 * **nothing called it**: the portfolio built its Trades tab from `spotTrades`
 * alone, so a card swap appeared as the fills underneath it rather than as the
 * swap the user actually made. This is the fetcher it never had.
 *
 * Mirrors `tradehistories.ts` exactly, including the no-address early return —
 * the portfolio renders before a wallet connects, and a `getAddress(undefined)`
 * throw there would take the page down rather than showing an empty tab.
 */

export type SpotSwap = {
  txHash: string;
  logIndex: number;
  recipient: string;
  tokenIn: string;
  tokenOut: string;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  tokenInLogoURI: string | null;
  tokenOutLogoURI: string | null;
  amountIn: number | null;
  amountOut: number | null;
  amountInBN: string | null;
  amountOutBN: string | null;
  timestamp: number;
};

export type SpotAccountSwaps = {
  swaps: SpotSwap[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
  noAddress?: boolean;
  lastUpdated: number;
};

export const getSpotAccountSwaps = async (
  networkName: string,
  address: string | undefined,
  limit: number,
  page: number,
): Promise<SpotAccountSwaps> => {
  if (!address) {
    return {
      swaps: [],
      totalCount: 0,
      totalPages: 0,
      pageSize: 0,
      noAddress: true,
      lastUpdated: Date.now(),
    };
  }
  const encoded = getAddress(address);
  const url = `${PonderLinks[networkName]}/api/liquidity/swaps/${encoded}/${limit}/${page}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return { ...data, lastUpdated: Date.now() } as SpotAccountSwaps;
};
