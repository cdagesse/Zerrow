import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import { explainRuleMatch } from "@/utils/ai/choose-rule/explain-conditions";
import { trackRuleToolCall } from "./shared";

const explainRuleMatchInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Exact message ID of the email to explain. Use a messageId from searchInbox, readEmail, or getRuleExecutionForMessage.",
    ),
  ruleName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional exact rule name to explain. Omit to evaluate every enabled rule against this email, which is what you want when the user asks why it did NOT go somewhere.",
    ),
});

type ExplainRuleMatchOutput =
  | {
      messageId: string;
      subject: string | null;
      from: string | null;
      isReplyInThread: boolean;
      explanations: Array<{
        ruleName: string;
        operator: string;
        staticMatched: boolean;
        failedStaticFields: string[];
        aiLegReachable: boolean;
        runsOnThreads: boolean;
        skippedBecauseReply: boolean;
        conditions: Array<{
          field: string;
          pattern: string;
          normalization?: string;
        }>;
        summary: string;
      }>;
    }
  | { error: string };

export const explainRuleMatchTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool<z.infer<typeof explainRuleMatchInputSchema>, ExplainRuleMatchOutput>({
    description:
      "Explain how the rule matcher read each rule against a specific email, including the normalizations it applied. Returns, per rule, whether the static conditions matched, which fields failed, whether the AI step was even reachable, and whether the rule was skipped because the email is a reply. Use this whenever the user asks why an email went to the wrong place, or why it did not go where they expected — it is the only way to see the matcher's interpretation rather than guessing from the rule text. A summary that says an outcome was impossible under the rule's operator indicates a likely bug: tell the user and offer to flag it for review rather than proposing a rule change.",
    inputSchema: explainRuleMatchInputSchema,
    execute: async ({ messageId, ruleName }) => {
      trackRuleToolCall({ tool: "explain_rule_match", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        const message = await emailProvider.getMessage(messageId);
        if (!message) return { error: `Message ${messageId} not found.` };

        const rules = await prisma.rule.findMany({
          where: {
            emailAccountId,
            enabled: true,
            ...(ruleName ? { name: ruleName } : {}),
          },
          select: {
            name: true,
            from: true,
            to: true,
            subject: true,
            body: true,
            instructions: true,
            groupId: true,
            conditionalOperator: true,
            subjectMatchMode: true,
            runOnThreads: true,
          },
        });

        if (!rules.length) {
          return {
            error: ruleName
              ? `No enabled rule named "${ruleName}".`
              : "No enabled rules on this account.",
          };
        }

        const isReply = emailProvider.isReplyInThread(message);

        return {
          messageId,
          subject: message.headers?.subject ?? null,
          from: message.headers?.from ?? null,
          isReplyInThread: isReply,
          explanations: rules.map((rule) => {
            const explanation = explainRuleMatch({ rule, message, logger });
            // A rule that never ran on this email can't be blamed for the
            // outcome, and is the fix when the user expected it to fire.
            const skippedBecauseReply = isReply && !rule.runOnThreads;
            return {
              ruleName: explanation.ruleName,
              operator: explanation.operator,
              staticMatched: explanation.staticMatched,
              failedStaticFields: explanation.failedStaticFields,
              aiLegReachable: explanation.aiLegReachable,
              runsOnThreads: rule.runOnThreads,
              skippedBecauseReply,
              conditions: explanation.conditions,
              summary: skippedBecauseReply
                ? `${explanation.summary} This email is a reply and "${rule.name}" only runs on the first message of a thread, so it was never evaluated. Turning on "Apply to threads" for this rule would let it apply to replies.`
                : explanation.summary,
            };
          }),
        };
      } catch (error) {
        logger.error("explainRuleMatch failed", { error, messageId });
        return { error: "Could not explain the match for this email." };
      }
    },
  });

export type ExplainRuleMatchTool = InferUITool<
  ReturnType<typeof explainRuleMatchTool>
>;
