import { z } from "zod";
import { LogicalOperator } from "@/generated/prisma/enums";

export const saveFolderRuleBody = z
  .object({
    labelId: z.string().min(1),
    labelName: z.string().min(1),
    enabled: z.boolean(),
    instructions: z.string().nullish(),
    from: z.string().nullish(),
    conditionalOperator: z.enum([LogicalOperator.AND, LogicalOperator.OR]),
  })
  .refine((data) => data.instructions?.trim() || data.from?.trim(), {
    message: "Add AI instructions or sender addresses",
  });
export type SaveFolderRuleBody = z.infer<typeof saveFolderRuleBody>;

export const generateFolderInstructionsBody = z.object({
  labelId: z.string().min(1),
  labelName: z.string().min(1),
});
export type GenerateFolderInstructionsBody = z.infer<
  typeof generateFolderInstructionsBody
>;
