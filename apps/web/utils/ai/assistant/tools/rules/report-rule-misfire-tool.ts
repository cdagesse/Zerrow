import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import { explainRuleMatch } from "@/utils/ai/choose-rule/explain-conditions";
import { extractEmailAddress } from "@/utils/email";
import { trackRuleToolCall } from "./shared";

const reportRuleMisfireInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe("Exact message ID of the email that was routed wrong."),
  expectedRuleName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Exact name of the rule the user says it should have matched. Omit only when they know it was wrong but not where it belongs.",
    ),
  suspectedBug: z
    .boolean()
    .optional()
    .describe(
      "True when explainRuleMatch showed an outcome the rule's operator makes impossible — an engine problem rather than a misconfiguration. Do not set this just because the user is frustrated.",
    ),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe("Short note in the user's own words about what they expected."),
});

type ReportRuleMisfireOutput =
  | {
      success: true;
      reportId: string;
      suspectedBug: boolean;
      expectedRuleName: string | null;
      actualRuleName: string | null;
    }
  | { error: string };

export const reportRuleMisfireTool = ({
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
  tool<z.infer<typeof reportRuleMisfireInputSchema>, ReportRuleMisfireOutput>({
    description:
      "Record that an email was routed to the wrong rule, after the user has confirmed both what happened and where it should have gone. This writes a review record only — it changes no rules and fixes nothing on its own, so still propose the actual fix separately. Use it when the user says an outcome was wrong, and always when explainRuleMatch indicates a likely engine bug, so the case is queued for review with the evidence attached.",
    inputSchema: reportRuleMisfireInputSchema,
    execute: async ({ messageId, expectedRuleName, suspectedBug, note }) => {
      trackRuleToolCall({ tool: "report_rule_misfire", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const message = await emailProvider.getMessage(messageId);
        if (!message) return { error: `Message ${messageId} not found.` };

        const [executed, expectedRule, allRules] = await Promise.all([
          prisma.executedRule.findFirst({
            where: { emailAccountId, messageId },
            orderBy: { createdAt: "desc" },
            select: { ruleId: true, rule: { select: { name: true } } },
          }),
          expectedRuleName
            ? prisma.rule.findFirst({
                where: { emailAccountId, name: expectedRuleName },
                select: { id: true, name: true },
              })
            : null,
          prisma.rule.findMany({
            where: { emailAccountId, enabled: true },
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
            },
          }),
        ]);

        if (expectedRuleName && !expectedRule) {
          return {
            error: `No rule named "${expectedRuleName}". Read the user's rules first and use an exact name.`,
          };
        }

        // Snapshot the explanation: rules get edited, so re-evaluating later
        // would not reproduce the decision being reported.
        const explanation = allRules.map((rule) =>
          explainRuleMatch({ rule, message, logger }),
        );

        const sender = extractEmailAddress(message.headers?.from ?? "") || "";
        const report = await prisma.ruleMisfireReport.upsert({
          where: { emailAccountId_messageId: { emailAccountId, messageId } },
          create: {
            emailAccountId,
            messageId,
            threadId: message.threadId ?? messageId,
            sender,
            subject: message.headers?.subject ?? null,
            actualRuleId: executed?.ruleId ?? null,
            expectedRuleId: expectedRule?.id ?? null,
            explanation,
            suspectedBug: suspectedBug ?? false,
            reviewNote: note ?? null,
          },
          update: {
            expectedRuleId: expectedRule?.id ?? undefined,
            suspectedBug: suspectedBug ?? undefined,
            reviewNote: note ?? undefined,
            explanation,
          },
          select: { id: true, suspectedBug: true },
        });

        return {
          success: true,
          reportId: report.id,
          suspectedBug: report.suspectedBug,
          expectedRuleName: expectedRule?.name ?? null,
          actualRuleName: executed?.rule?.name ?? null,
        };
      } catch (error) {
        logger.error("reportRuleMisfire failed", { error, messageId });
        return { error: "Could not record the report for this email." };
      }
    },
  });

export type ReportRuleMisfireTool = InferUITool<
  ReturnType<typeof reportRuleMisfireTool>
>;
