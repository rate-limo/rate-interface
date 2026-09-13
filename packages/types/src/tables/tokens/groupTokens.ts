import { z } from "zod";

export const spotGroupToken = z.object({
	/// group id
	groupId: z.string(),
	/// token id
	tokenId: z.string(),
	/// token symbol
	symbol: z.string(),
});

export type SpotGroupToken = z.infer<typeof spotGroupToken>;
