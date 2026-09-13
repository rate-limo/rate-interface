import { z } from "zod";
import { spotToken } from "../tokens";

export const spotOrder = z.object({
  isBid: z.boolean(),
  orderId: z.number(),
  base: spotToken,
  baseSymbol: z.string(),
  baseLogoURI: z.string(),
  quote: spotToken,
  quoteSymbol: z.string(),
  quoteLogoURI: z.string(),
  pairSymbol: z.string(),
  pair: z.string(),
  price: z.number(),
  asset: spotToken,
  // Decimals of the asset leg. Present on the wire; previously undeclared here.
  assetDecimals: z.number().optional(),
  assetSymbol: z.string(),
  amount: z.number(),
  placed: z.number(),
  timestamp: z.number(),
  account: z.string(),
  txHash: z.string(),
});

export type SpotOrder = z.infer<typeof spotOrder>;
