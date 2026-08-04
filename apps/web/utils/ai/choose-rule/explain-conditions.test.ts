import { describe, expect, it } from "vitest";
import { LogicalOperator } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { explainRuleMatch } from "./explain-conditions";
import { getHeaders, getMessage } from "./match-rules-test-utils";

const logger = createTestLogger();

const baseRule = {
  name: "Rule",
  from: null,
  to: null,
  subject: null,
  body: null,
  instructions: null,
  groupId: null,
  conditionalOperator: LogicalOperator.AND,
  subjectMatchMode: null,
};

describe("explainRuleMatch", () => {
  it("explains why a reply-prefixed subject pattern matches an original", () => {
    // Production case: "Travel Rate" from an internal sender was filed and
    // archived by a rule whose subject condition is "RE:Daily || RE:Travel".
    const result = explainRuleMatch({
      rule: {
        ...baseRule,
        name: "GM Responses",
        from: "nucar.com,dcd.auto,intervaleproperties.com",
        subject: "RE:Daily || RE:Travel",
      },
      message: getMessage({
        headers: getHeaders({
          from: "Chuck Maynard <cmaynard@nucar.com>",
          subject: "Travel Rate",
        }),
      }),
      logger,
    });

    expect(result.staticMatched).toBe(true);
    const subject = result.conditions.find((c) => c.field === "subject");
    expect(subject?.normalization).toContain("Reply prefixes are stripped");
    expect(subject?.normalization).toContain(
      '"RE:Travel" also matches "Travel"',
    );
    expect(result.summary).toContain("also matches the original message");
    // The explanation must name the fix, since this is the exact case where a
    // reply landing on the original's rule looks like a misroute.
    expect(result.summary).toContain("replies only");
  });

  it("reports a subject condition scoped to replies", () => {
    const result = explainRuleMatch({
      rule: {
        ...baseRule,
        name: "GM Responses",
        subject: "Travel Rate",
        subjectMatchScope: "REPLIES",
      },
      message: getMessage({
        headers: getHeaders({
          from: "chuck@gm.com",
          subject: "Travel Rate",
        }),
      }),
      logger,
    });

    const subject = result.conditions.find((c) => c.field === "subject");
    expect(subject?.normalization).toContain("scoped to replies");
    expect(result.staticMatched).toBe(false);
  });

  it("says the AI could not have chosen a rule whose static leg failed under AND", () => {
    // Production case: an email from chevrolet.com matched a rule restricted
    // to internal domains, with an AI-authored reason.
    const result = explainRuleMatch({
      rule: {
        ...baseRule,
        name: "Notification",
        from: "nucar.com,DCD.auto",
        instructions: "Alerts, status updates, or system messages",
      },
      message: getMessage({
        headers: getHeaders({
          from: "Dan Adamcheck <dan.adamcheck@chevrolet.com>",
          subject: "Closing the books on July",
        }),
      }),
      logger,
    });

    expect(result.staticMatched).toBe(false);
    expect(result.aiLegReachable).toBe(false);
    expect(result.summary).toContain("dropped before the AI step");
    expect(result.summary).toContain("bug worth flagging");
  });

  it("keeps the AI leg reachable when the static leg passes", () => {
    const result = explainRuleMatch({
      rule: {
        ...baseRule,
        name: "Notification",
        from: "nucar.com",
        instructions: "Alerts and status updates",
      },
      message: getMessage({
        headers: getHeaders({
          from: "Someone <someone@nucar.com>",
          subject: "Nightly job finished",
        }),
      }),
      logger,
    });

    expect(result.staticMatched).toBe(true);
    expect(result.aiLegReachable).toBe(true);
    expect(result.summary).toContain("AI instructions were then evaluated");
  });

  it("explains || alternatives when no reply prefix is involved", () => {
    const result = explainRuleMatch({
      rule: { ...baseRule, subject: "Daily Report || Weekly Summary" },
      message: getMessage({
        headers: getHeaders({ subject: "Daily Report" }),
      }),
      logger,
    });

    const subject = result.conditions.find((c) => c.field === "subject");
    expect(subject?.normalization).toContain("2 alternatives");
  });
});
