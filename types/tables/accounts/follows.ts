import { z } from "zod";

export const follows = z.object({
	follower: z.string(),
	following: z.string(),
});

export type Follows = z.infer<typeof follows>;