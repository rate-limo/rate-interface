import { z } from "zod";
import { spotToken } from "../tokens";
export const spotTrade = z.object({
  // order id of the trade
  orderId: z.number(),
  // base token address of the pair
  base: spotToken,
  // quote token address of the pair
  quote: spotToken,
  // base token symbol of the pair
  baseSymbol: z.string(),
  // quote token symbol of the pair
  quoteSymbol: z.string(),
  // pair contract address of the trade
  pair: z.string(),
  // symbol of the pair
  pairSymbol: z.string(),
  // is bid or ask
  isBid: z.boolean(),
  // price of the trade
  price: z.number(),
  // sender of the transaction
  account: z.string(),
  // asset of the trade
  asset: spotToken,
  // symbol of the asset
  assetSymbol: z.string(),
  // amount of the trade
  amount: z.number(),
  // value in usd
  valueUSD: z.number(),
  // base amount of the trade
  baseAmount: z.number(),
  // quote amount of the trade
  quoteAmount: z.number(),
  // Fee per leg, written by the broker and returned by the gateway all along — the
  // stream schema has carried these since it gained them; this copy had not.
  baseFee: z.number().optional(),
  quoteFee: z.number().optional(),
  // timestamp of the trade
  timestamp: z.number(),
  // taker of the trade
  taker: z.string(),
  // maker of the trade
  maker: z.string(),
  // hash of the transaction
  txHash: z.string(),
});

export type SpotTrade = z.infer<typeof spotTrade>;
