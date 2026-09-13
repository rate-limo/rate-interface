"use server";
import { getAddress } from 'viem';
import { PonderLinks } from '@/consts';
import { SpotOrderHistory } from '@/types';

export type SpotAccountOrderHistory = {
  orderHistories: SpotOrderHistory[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
  lastUpdated: number;
  noAddress: boolean | undefined;
};

export const getSpotAccountOrderHistories = async (
  networkName: string,
  address: string,
  limit: number,
  page: number,
): Promise<SpotAccountOrderHistory> => {
  if (!address) {
    console.log("No address provided");
    return {
      orderHistories: [],
      totalCount: 0,
      totalPages: 0,
      pageSize: 0,
      noAddress: true,
      lastUpdated: Date.now(),
    };
  }
  const encoded = getAddress(address);
  let url;
  url = `${PonderLinks[networkName]}/api/orderhistory/${encoded}/${limit}/${page}`;
  const response = await fetch(url as string);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  return { ...data, lastUpdated: Date.now() } as SpotAccountOrderHistory;
};