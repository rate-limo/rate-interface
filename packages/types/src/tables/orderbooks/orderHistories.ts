import { z } from "zod";

export const spotOrderHistory = z.object({
  orderId: z.number(),
  isBid: z.boolean(),
  base: z.string(),
  baseSymbol: z.string(),
  baseLogoURI: z.string(),
  quote: z.string(),
  quoteSymbol: z.string(),
  quoteLogoURI: z.string(),
  pair: z.string(),
  pairSymbol: z.string(),
  price: z.number(),
  priceBN: z.bigint(),
  asset: z.string(),
  assetSymbol: z.string(),
  assetDecimals: z.number(),
  amount: z.number(),
  timestamp: z.number(),
  account: z.string(),
  txHash: z.string(),
  gasUsed: z.number(),
  status: z.string().default("open"),
});

export type SpotOrderHistory = z.infer<typeof spotOrderHistory>;
