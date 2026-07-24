"use server";

import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { ActionType } from "@/generated/prisma/enums";
import {
  saveFolderRuleBody,
  generateFolderInstructionsBody,
} from "@/utils/actions/folder-rule.validation";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";
import {
  getBlockedLowTrustStaticFromActionTypes,
  LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE,
} from "@/utils/rule/static-from-risk";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiGenerateFolderInstructions } from "@/utils/ai/label/generate-folder-instructions";
import { isDefined } from "@/utils/types";

// Saves the rule that files emails into a folder (the folder drawer's "AI
// filing" section). Only the fields the drawer owns are written on update —
// the rule's actions and any other conditions stay untouched.
export const saveFolderRuleAction = actionClient
  .metadata({ name: "saveFolderRule" })
  .inputSchema(saveFolderRuleBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        labelId,
        labelName,
        enabled,
        instructions,
        from,
        conditionalOperator,
      },
    }) => {
      const trimmedInstructions = instructions?.trim() || null;
      const trimmedFrom = from?.trim() || null;

      // Older rules reference their label by name only (labelId is filled
      // lazily), so match either — the Assistant page and this drawer must
      // agree on which rule files into the folder
      const existing = await prisma.rule.findFirst({
        where: {
          emailAccountId,
          actions: {
            some: {
              type: ActionType.LABEL,
              OR: [{ labelId }, { label: labelName }],
            },
          },
        },
        select: {
          id: true,
          organizationRuleId: true,
          actions: { select: { type: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      if (existing) {
        if (existing.organizationRuleId) {
          throw new SafeError(
            "This folder is filed by an organization-managed rule. Edit it from the Assistant page.",
          );
        }

        const blocked = getBlockedLowTrustStaticFromActionTypes(
          trimmedFrom,
          existing.actions.map((action) => action.type),
        );
        if (blocked.length) {
          throw new SafeError(LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE, 400);
        }

        await prisma.rule.update({
          where: { id: existing.id, emailAccountId },
          data: {
            enabled,
            instructions: trimmedInstructions,
            from: trimmedFrom,
            conditionalOperator,
          },
        });

        return { ruleId: existing.id };
      }

      const name = await findAvailableRuleName(emailAccountId, labelName);

      const rule = await createRuleWithResolvedActions({
        emailAccountId,
        data: {
          name,
          enabled,
          instructions: trimmedInstructions,
          from: trimmedFrom,
          conditionalOperator,
          runOnThreads: false,
        },
        actions: [{ type: ActionType.LABEL, label: labelName, labelId }],
      });

      return { ruleId: rule.id };
    },
  );

// Drafts filing instructions by reading what's already in the folder. Returns
// a draft for the user to review — nothing is saved here.
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

// Not every throwable is an Error: aborted fetches throw DOMException (which
// doesn't extend Error) and some provider SDKs throw plain objects
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 200);
  }
  if (typeof error === "string") return error.slice(0, 200);
  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      message?: unknown;
      error?: { message?: unknown };
    };
    if (typeof candidate.message === "string" && candidate.message) {
      const name =
        typeof candidate.name === "string" && candidate.name
          ? `${candidate.name}: `
          : "";
      return `${name}${candidate.message}`.slice(0, 200);
    }
    if (typeof candidate.error?.message === "string") {
      return candidate.error.message.slice(0, 200);
    }
    try {
      return JSON.stringify(error).slice(0, 200);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error).slice(0, 200);
}

async function findAvailableRuleName(
  emailAccountId: string,
  labelName: string,
) {
  const base = `Label: ${labelName}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = attempt === 0 ? base : `${base} (${attempt + 1})`;
    const clash = await prisma.rule.findUnique({
      where: { name_emailAccountId: { name, emailAccountId } },
      select: { id: true },
    });
    if (!clash) return name;
  }
  throw new SafeError(
    `Too many rules named "${base}". Rename one on the Assistant page first.`,
  );
}
