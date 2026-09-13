"use server";
import { PonderLinks } from '@/consts';
import type { SpotTrade } from '@/types';
import { getAddress } from 'viem';

export interface SpotRecentOverallTradesResponse {
  trades: SpotTrade[];
  lastUpdated: number;
}

export const getSpotRecentOverallTrades = async (
  networkName: string,
  limit: number,
  page: number,
): Promise<SpotRecentOverallTradesResponse> => {
  let url;
  url = `${PonderLinks[networkName]}/api/trades/all/${limit}/${page}`;
  const response = await fetch(url as string);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  return { ...data, lastUpdated: Date.now() } as SpotRecentOverallTradesResponse;
};

export const fetchRecentPairTradesPaginated = async (
  networkName: string,
  base: string,
  quote: string,
  limit: number,
  page: number,
) => {
  let url;
  const encodedBase = getAddress(base);
  const encodedQuote = getAddress(quote);
  url = `${PonderLinks[networkName]}/api/trades/pair/${encodedBase}/${encodedQuote}/${limit}/${page}`;
  const response = await fetch(url as string);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  return { ...data, lastUpdated: Date.now() } as { trades: SpotTrade[], lastUpdated: number };
};
