"use server";
import { getAddress } from 'viem';
import { PonderLinks } from '@/consts';
import type { SpotTrade } from '@/types';

export type SpotAccountTradeHistory = {
  tradeHistories: SpotTrade[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
  noAddress: boolean | undefined;
  lastUpdated: number;
};

export const getSpotAccountTradeHistories = async (
  networkName: string,
  address: string | undefined,
  limit: number,
  page: number,
): Promise<SpotAccountTradeHistory> => {
  if (!address) {
    console.log("No address provided");
    return {
      tradeHistories: [],
      totalCount: 0,
      totalPages: 0,
      pageSize: 0,
      noAddress: true,
      lastUpdated: Date.now(),
    };
  }
  const encoded = getAddress(address);
  let url;
  url = `${PonderLinks[networkName]}/api/tradehistory/${encoded}/${limit}/${page}`;
  const response = await fetch(url as string);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  return { ...data, lastUpdated: Date.now() } as SpotAccountTradeHistory;
};