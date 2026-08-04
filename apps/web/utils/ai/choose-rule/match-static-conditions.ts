import { SubjectMatchMode, SubjectMatchScope } from "@/generated/prisma/enums";
import {
  describeStaticConditions,
  type StaticConditionField,
} from "@/utils/condition";
import {
  extractEmailAddress,
  extractEmailAddresses,
  extractNameFromEmail,
  splitRecipientList,
} from "@/utils/email";
import type { Logger } from "@/utils/logger";
import {
  hasReplyPrefix,
  matchesEmailFieldPattern,
  matchesSubjectPattern,
  matchesTextPattern,
} from "@/utils/ai/choose-rule/match-patterns";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";

const MODULE = "match-static-conditions";

type StaticRuleConditions = Pick<
  RuleWithActions,
  "from" | "to" | "subject" | "body"
> & {
  subjectMatchMode?: SubjectMatchMode | null;
  subjectMatchScope?: SubjectMatchScope | null;
  fromExclude?: boolean;
  toExclude?: boolean;
  subjectExclude?: boolean;
};

export function matchesStaticRule(
  rule: StaticRuleConditions,
  message: ParsedMessage,
  logger: Logger,
) {
  return getStaticConditionFailures(rule, message, logger).matched;
}

// Per-field results so a failed rule can say WHICH condition rejected the
// email and what that condition requires — "conditions didn't match" alone
// sends the user hunting through the rule editor blind
export function getStaticConditionFailures(
  rule: StaticRuleConditions,
  message: ParsedMessage,
  logger: Logger,
): { matched: boolean; failedConditions: string[] } {
  const log = logger.with({ module: MODULE });
  const { from, to, subject, body } = rule;

  if (!from && !to && !subject && !body)
    return { matched: false, failedConditions: [] };

  const {
    fromAddressHeader,
    toAddressHeader,
    fromDisplayNameHeader,
    toDisplayNameHeader,
  } = getNormalizedEmailMatchHeaders(message);

  const failedFields = new Set<StaticConditionField>();

  const fromPatternMatch = from
    ? matchesEmailFieldPattern({
        pattern: from,
        addressText: fromAddressHeader.toLowerCase(),
        displayNameText: fromDisplayNameHeader.toLowerCase(),
        logger: log,
      })
    : true;
  // An excluded condition matches when the pattern does NOT match
  const fromMatch = from
    ? rule.fromExclude
      ? !fromPatternMatch
      : fromPatternMatch
    : true;
  if (!fromMatch && from) failedFields.add("from");

  const toPatternMatch = to
    ? matchesEmailFieldPattern({
        pattern: to,
        addressText: toAddressHeader.toLowerCase(),
        displayNameText: toDisplayNameHeader.toLowerCase(),
        logger: log,
      })
    : true;
  const toMatch = to
    ? rule.toExclude
      ? !toPatternMatch
      : toPatternMatch
    : true;
  if (!toMatch && to) failedFields.add("to");

  // Scope is applied before the pattern, and before subjectExclude: "is not
  // Daily Report, replies only" means the rule ignores originals rather than
  // matching all of them. Negating an out-of-scope message would do the latter.
  const subjectInScope = subject
    ? isSubjectInMatchScope(rule.subjectMatchScope, message.headers.subject)
    : true;
  const subjectPatternMatch =
    subject && subjectInScope
      ? matchesSubjectPattern(subject, message.headers.subject, log, {
          anchorStart: rule.subjectMatchMode === SubjectMatchMode.STARTS_WITH,
        })
      : true;
  const subjectMatch = subject
    ? subjectInScope
      ? rule.subjectExclude
        ? !subjectPatternMatch
        : subjectPatternMatch
      : false
    : true;
  if (!subjectMatch && subject) failedFields.add("subject");

  const bodyMatch = body
    ? matchesTextPattern(body, message.textPlain || "", log)
    : true;
  if (!bodyMatch && body) failedFields.add("body");

  // Described by the shared formatter so the reason a rule was skipped reads
  // exactly like the condition shown in the editor and the rules list.
  const failedConditions = describeStaticConditions(rule)
    .filter((condition) => failedFields.has(condition.field))
    .map((condition) => condition.text);

  return {
    matched: fromMatch && toMatch && subjectMatch && bodyMatch,
    failedConditions,
  };
}

function getNormalizedEmailMatchHeaders(message: ParsedMessage) {
  return {
    fromAddressHeader: normalizeEmailHeaderForRuleMatching(
      message.headers.from,
    ),
    toAddressHeader: normalizeEmailHeaderForRuleMatching(
      message.headers.to,
      true,
    ),
    fromDisplayNameHeader: normalizeEmailDisplayNameHeaderForRuleMatching(
      message.headers.from,
    ),
    toDisplayNameHeader: normalizeEmailDisplayNameHeaderForRuleMatching(
      message.headers.to,
    ),
  };
}

function normalizeEmailHeaderForRuleMatching(
  header: string,
  allowMultiple = false,
) {
  if (!header) return "";

  if (allowMultiple) {
    return extractEmailAddresses(header).join(", ");
  }

  return extractEmailAddress(header);
}

function normalizeEmailDisplayNameHeaderForRuleMatching(header: string) {
  if (!header) return "";

  return splitRecipientList(header)
    .map((part) => {
      const name = extractNameFromEmail(part).trim();
      const email = extractEmailAddress(part).trim().toLowerCase();

      if (!name) return "";
      if (email && name.toLowerCase() === email) return "";

      return name;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Whether a subject condition applies to this message at all.
 *
 * ANY keeps the long-standing behaviour: prefixes are stripped from both sides
 * so a topic rule catches the opening message and every reply to it.
 */
export function isSubjectInMatchScope(
  scope: SubjectMatchScope | null | undefined,
  subject: string,
): boolean {
  if (!scope || scope === SubjectMatchScope.ANY) return true;
  const isReply = hasReplyPrefix(subject);
  return scope === SubjectMatchScope.REPLIES ? isReply : !isReply;
}
