import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GroupItemType,
  LogicalOperator,
  SystemType,
} from "@/generated/prisma/enums";
import type { GroupItem, Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";
import {
  getColdEmailRule,
  isColdEmailRuleEnabled,
} from "@/utils/cold-email/cold-email-rule";
import { findMatchingRules } from "./match-rules";
import {
  getHeaders,
  getMessage,
  getProvider,
  getRule,
} from "./match-rules-test-utils";

const logger = createTestLogger();
const provider = getProvider();

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi.fn(),
}));
vi.mock("@/utils/reply-tracker/check-sender-reply-history", () => ({
  checkSenderReplyHistory: vi.fn(),
}));
vi.mock("@/utils/cold-email/cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
  isColdEmailRuleEnabled: vi.fn(),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({ isColdEmail: vi.fn() }));

// Production misfire: the Notification rule is
//   op=AND, from="nucar.com,DCD.auto,nucarapps.com,nucarpulse.com", + AI, + a group
// It labelled AND archived mail from dan.adamcheck@chevrolet.com, and the
// recorded reason even noted the sender was "not nucar.com/DCD.auto/etc.".
// Under AND a failing static leg must drop the rule before the AI ever sees it.
describe("AND + static from must gate the AI leg (production repro)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(false);
    vi.mocked(getColdEmailRule).mockResolvedValue(null as never);
    prisma.group.findMany.mockResolvedValue([] as never);
  });

  const notification = getRule({
    name: "Notification",
    instructions: "Notifications: Alerts, status updates, or system messages",
    from: "nucar.com,DCD.auto,nucarapps.com,nucarpulse.com",
    systemType: SystemType.NOTIFICATION,
    conditionalOperator: LogicalOperator.AND,
  });

  it("does not offer the rule to the AI when the sender is outside the from list", async () => {
    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [],
      reason: "",
    } as never);

    const message = getMessage({
      headers: getHeaders({
        from: "Dan Adamcheck <dan.adamcheck@chevrolet.com>",
        subject: "Closing the books on July",
      }),
    });

    const result = await findMatchingRules({
      rules: [notification] as never,
      message,
      emailAccount: getEmailAccount(),
      provider,
      logger,
      modelType: "default",
    } as never);

    // The AI step must not even be consulted for this rule.
    expect(aiChooseRule).not.toHaveBeenCalled();
    expect(result.matches).toEqual([]);
  });

  it("still offers the rule to the AI when the sender is inside the from list", async () => {
    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [],
      reason: "",
    } as never);

    const message = getMessage({
      headers: getHeaders({
        from: "Someone <someone@nucar.com>",
        subject: "Nightly job finished",
      }),
    });

    await findMatchingRules({
      rules: [notification] as never,
      message,
      emailAccount: getEmailAccount(),
      provider,
      logger,
      modelType: "default",
    } as never);

    expect(aiChooseRule).toHaveBeenCalled();
  });

  // Production shape: Notification also carries a learned-pattern group. A
  // pattern hit stands in for the AI clause only — under AND the explicit
  // static conditions stay hard requirements, so a learned "FROM: dan@…"
  // must not route a sender the from-list excludes.
  it("a learned pattern does not bypass the failing static leg under AND", async () => {
    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [],
      reason: "",
    } as never);

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({
            type: GroupItemType.FROM,
            value: "dan.adamcheck@chevrolet.com",
          }),
        ],
        rule: notification,
      }),
    ] as never);

    const withGroup = { ...notification, groupId: "group1" };
    const message = getMessage({
      headers: getHeaders({
        from: "Dan Adamcheck <dan.adamcheck@chevrolet.com>",
        subject: "Closing the books on July",
      }),
    });

    const result = await findMatchingRules({
      rules: [withGroup] as never,
      message,
      emailAccount: getEmailAccount(),
      provider,
      logger,
      modelType: "default",
    } as never);

    expect(result.matches).toEqual([]);
  });
});

function getGroup(
  overrides: Partial<
    Prisma.GroupGetPayload<{ include: { items: true; rule: true } }>
  > = {},
): Prisma.GroupGetPayload<{ include: { items: true; rule: true } }> {
  return {
    id: "group1",
    name: "group",
    createdAt: new Date(),
    updatedAt: new Date(),
    emailAccountId: "emailAccountId",
    prompt: null,
    items: [],
    rule: null,
    ...overrides,
  } as never;
}

function getGroupItem(overrides: Partial<GroupItem> = {}): GroupItem {
  return {
    id: "groupItem1",
    createdAt: new Date(),
    updatedAt: new Date(),
    groupId: "group1",
    type: GroupItemType.FROM,
    value: "test@example.com",
    exclude: false,
    reason: null,
    threadId: null,
    messageId: null,
    source: null,
    ...overrides,
  } as never;
}
