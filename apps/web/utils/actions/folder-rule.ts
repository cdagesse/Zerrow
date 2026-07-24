"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { describeError, SafeError } from "@/utils/error";
import { generateFolderInstructionsBody } from "@/utils/actions/folder-rule.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiGenerateFolderInstructions } from "@/utils/ai/label/generate-folder-instructions";
import { isDefined } from "@/utils/types";

// Drafts filing instructions by reading what's already in the folder. Returns
// a draft for the user to review in the rule editor — nothing is saved here.
export const generateFolderInstructionsAction = actionClient
  .metadata({ name: "generateFolderInstructions" })
  .inputSchema(generateFolderInstructionsBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { labelId, labelName },
    }) => {
      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const threads = await emailProvider.getThreadsWithLabel({
        labelId,
        maxResults: 15,
      });

      const emails = threads
        .map((thread) => thread.messages.at(-1))
        .filter(isDefined)
        .map((message) =>
          getEmailForLLM(message, { removeForwarded: true, maxLength: 1000 }),
        );

      if (!emails.length) {
        throw new SafeError(
          "This folder has no emails to learn from yet. Add some emails first or write instructions manually.",
        );
      }

      try {
        const result = await aiGenerateFolderInstructions({
          emailAccount,
          labelName,
          emails,
        });
        if (!result) throw new SafeError("Could not generate instructions");
        return result;
      } catch (error) {
        if (error instanceof SafeError) throw error;
        logger.error("Error generating folder instructions", { error });
        // Surface the underlying cause: without it, config problems (model,
        // key, quota) are indistinguishable from transient failures
        throw new SafeError(
          `Could not generate instructions from this folder: ${describeError(error)}`,
        );
      }
    },
  );
