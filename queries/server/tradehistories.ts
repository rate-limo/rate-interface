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

/** One fill behind a grouped trade, with its counterparty (`origin`). */
export type SpotAccountTradeFill = {
  tradeId: string;
  txHash: string;
  timestamp: number;
  price: number;
  baseAmount: number;
  quoteAmount: number;
  baseSymbol: string;
  quoteSymbol: string;
  maker: string;
  /** `"pool"` when the maker is a pool, `"maker"` when it is another trader. */
  origin: "pool" | "maker";
  isBid: boolean;
  taker: string;
  baseFee: number | null;
  quoteFee: number | null;
  /** A band pool's fee, in the token received; null on a book fill. */
  poolFee: number | null;
  poolFeeEstimated: boolean | null;
};

/**
 * The fills of ONE transaction in one market, for this wallet — the drill-down
 * behind a grouped trade or a crossed order (`/api/tradehistory/:address/fills/:txHash/:pair`).
 */
export const getSpotAccountTradeFills = async (
  networkName: string,
  address: string,
  txHash: string,
  pair: string,
): Promise<SpotAccountTradeFill[]> => {
  const url = `${PonderLinks[networkName]}/api/tradehistory/${getAddress(address)}/fills/${txHash}/${getAddress(pair)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = (await response.json()) as { fills?: SpotAccountTradeFill[] };
  return data.fills ?? [];
};
