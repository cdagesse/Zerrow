import { z } from "zod";

export const generateFolderInstructionsBody = z.object({
  labelId: z.string().min(1),
  labelName: z.string().min(1),
});
export type GenerateFolderInstructionsBody = z.infer<
  typeof generateFolderInstructionsBody
>;
