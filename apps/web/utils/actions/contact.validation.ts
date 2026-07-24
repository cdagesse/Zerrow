import { z } from "zod";

export const updateContactBody = z.object({
  email: z.string().email(),
  name: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  notes: z.string().max(10_000).nullish(),
});
export type UpdateContactBody = z.infer<typeof updateContactBody>;
