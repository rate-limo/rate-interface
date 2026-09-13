"use server";
import { getAddress } from "viem";
import { PonderLinks } from "@/consts";

async function fetchStop(networkName: string, path: string, address: string, limit: number, page: number) {
  const response = await fetch(`${PonderLinks[networkName]}/api/${path}/${getAddress(address)}/${limit}/${page}`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json() as Promise<{ orders?: Record<string, unknown>[]; orderHistories?: Record<string, unknown>[] }>;
}

export const getStopOrders = async (networkName: string, address: string, limit: number, page: number) =>
  fetchStop(networkName, "stoporders", address, limit, page);
export const getStopOrderHistories = async (networkName: string, address: string, limit: number, page: number) =>
  fetchStop(networkName, "stoporderhistory", address, limit, page);
