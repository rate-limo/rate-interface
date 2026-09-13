import { z } from "zod";

export const spotPairLike = z.object({
	account: z.string(),
	pair: z.string(),
	symbol: z.string(),
	base: z.string(),
	quote: z.string(),
});

export type SpotPairLike = z.infer<typeof spotPairLike>;