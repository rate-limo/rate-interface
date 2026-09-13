import { z } from "zod";

export const spotGroupPair = z.object({
	pairId: z.string(),
	groupId: z.string(),
	symbol: z.string(),
	base: z.string(),
	quote: z.string(),
});

export type SpotGroupPair = z.infer<typeof spotGroupPair>;
