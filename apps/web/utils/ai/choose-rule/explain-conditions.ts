import {
  LogicalOperator,
  type SubjectMatchMode,
} from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import { getConditionTypes } from "@/utils/condition";
import { getStaticConditionFailures } from "@/utils/ai/choose-rule/match-static-conditions";
import { splitSubjectPatterns } from "@/utils/ai/choose-rule/match-patterns";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

// Reply prefixes the subject matcher strips. Kept in sync with
// REPLY_PREFIX_REGEX in match-patterns.ts — see the note on `normalization`.
const REPLY_PREFIX = /^((re|fw|fwd|aw|wg|rv|enc)\s*:\s*)+/i;

export type ConditionExplanation = {
  field: "from" | "to" | "subject" | "body";
  pattern: string;
  /**
   * What the matcher actually compared after normalization. Populated only
   * when it differs from `pattern` — this is the step that makes a rule look
   * like it should not have matched when it did.
   */
  normalization?: string;
};

export type RuleMatchExplanation = {
  ruleName: string;
  operator: LogicalOperator;
  hasStaticCondition: boolean;
  hasAiCondition: boolean;
  staticMatched: boolean;
  failedStaticFields: string[];
  /** Whether the AI step was reachable for this rule given the operator. */
  aiLegReachable: boolean;
  conditions: ConditionExplanation[];
  /** Plain-language summary the assistant can quote back to the user. */
  summary: string;
};

/**
 * Explains how the matcher evaluated one rule against one message, including
 * the normalizations it applied.
 *
 * The chat can already read a rule and the outcome, but not *why* the matcher
 * behaved as it did, so it guesses. Two real misfires this exists to make
 * self-evident:
 *
 *  - a subject pattern of "RE:Travel" is stripped to "Travel" on both sides,
 *    so it also matches the original "Travel Rate" — not just replies
 *  - under AND a failing static leg drops the rule before the AI sees it, so
 *    "the AI chose this" is not a possible explanation when static failed
 */
export function explainRuleMatch({
  rule,
  message,
  logger,
}: {
  rule: {
    name: string;
    from: string | null;
    to: string | null;
    subject: string | null;
    body: string | null;
    instructions: string | null;
    groupId: string | null;
    conditionalOperator: LogicalOperator;
    subjectMatchMode?: SubjectMatchMode | null;
  };
  message: ParsedMessage;
  logger: Logger;
}): RuleMatchExplanation {
  const conditionTypes = getConditionTypes(rule as never);
  const hasStaticCondition = !!conditionTypes[ConditionType.STATIC];
  const hasAiCondition = !!conditionTypes[ConditionType.AI];

  const staticResult = hasStaticCondition
    ? getStaticConditionFailures(rule as never, message, logger)
    : { matched: false, failedConditions: [] as string[] };

  const conditions: ConditionExplanation[] = [];

  if (rule.subject) {
    const parts = splitSubjectPatterns(rule.subject);
    const stripped = parts
      .map((part) => ({ part, bare: part.replace(REPLY_PREFIX, "") }))
      .filter(({ part, bare }) => bare !== part);

    conditions.push({
      field: "subject",
      pattern: rule.subject,
      normalization: stripped.length
        ? `Reply prefixes are stripped from the pattern and the subject before comparing, so ${stripped
            .map(({ part, bare }) => `"${part}" also matches "${bare}"`)
            .join(
              " and ",
            )}. A pattern written to target replies will also match the original message.`
        : parts.length > 1
          ? `"||" splits this into ${parts.length} alternatives: ${parts.map((p) => `"${p}"`).join(", ")}. Any one matching is enough.`
          : undefined,
    });
  }

  for (const field of ["from", "to", "body"] as const) {
    const pattern = rule[field];
    if (pattern) conditions.push({ field, pattern });
  }

  // Under AND a failing static leg is terminal: the rule never reaches the AI
  // step. Under OR the AI leg is still tried when static misses.
  const isAnd = rule.conditionalOperator === LogicalOperator.AND;
  const staticBlocks = isAnd && hasStaticCondition && !staticResult.matched;
  const aiLegReachable = hasAiCondition && !staticBlocks;

  const summary = buildSummary({
    ruleName: rule.name,
    isAnd,
    hasStaticCondition,
    hasAiCondition,
    staticMatched: staticResult.matched,
    failedFields: staticResult.failedConditions,
    aiLegReachable,
    subjectNormalization: conditions.find((c) => c.field === "subject")
      ?.normalization,
  });

  return {
    ruleName: rule.name,
    operator: rule.conditionalOperator,
    hasStaticCondition,
    hasAiCondition,
    staticMatched: staticResult.matched,
    failedStaticFields: staticResult.failedConditions,
    aiLegReachable,
    conditions,
    summary,
  };
}

function buildSummary({
  ruleName,
  isAnd,
  hasStaticCondition,
  hasAiCondition,
  staticMatched,
  failedFields,
  aiLegReachable,
  subjectNormalization,
}: {
  ruleName: string;
  isAnd: boolean;
  hasStaticCondition: boolean;
  hasAiCondition: boolean;
  staticMatched: boolean;
  failedFields: string[];
  aiLegReachable: boolean;
  subjectNormalization?: string;
}) {
  const parts: string[] = [];

  if (hasStaticCondition) {
    parts.push(
      staticMatched
        ? `"${ruleName}" static conditions matched.`
        : `"${ruleName}" static conditions did not match${
            failedFields.length ? ` (failed: ${failedFields.join(", ")})` : ""
          }.`,
    );
  } else {
    parts.push(`"${ruleName}" has no static conditions.`);
  }

  if (isAnd && hasStaticCondition && !staticMatched) {
    parts.push(
      "Operator is AND, so the rule is dropped before the AI step — the AI could not have selected it. If it did, that is a bug worth flagging.",
    );
  } else if (hasAiCondition) {
    parts.push(
      aiLegReachable
        ? "The AI instructions were then evaluated to decide the final match."
        : "The AI step was not reached.",
    );
  }

  if (subjectNormalization) parts.push(subjectNormalization);

  return parts.join(" ");
}
