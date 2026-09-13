import { z } from "zod";

export const spotGroup = z.object({
	// trading view group id (e.g. iter_bitcoin, iter_memecoin)
	id: z.string(),
	name: z.string(),
	description: z.string(),
});
