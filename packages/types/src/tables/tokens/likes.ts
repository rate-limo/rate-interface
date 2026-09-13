import { z } from "zod";

export const spotTokenLike = z.object({
	account: z.string(),
	tokenId: z.string(),
	symbol: z.string(),
});

export type SpotTokenLike = z.infer<typeof spotTokenLike>;
