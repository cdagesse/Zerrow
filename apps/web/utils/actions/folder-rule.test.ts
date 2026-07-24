import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";

const { createRuleWithResolvedActionsMock } = vi.hoisted(() => ({
  createRuleWithResolvedActionsMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/rule/rule", () => ({
  createRuleWithResolvedActions: createRuleWithResolvedActionsMock,
}));

import { saveFolderRuleAction } from "@/utils/actions/folder-rule";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: {
      userId: "user-1",
      provider: "google",
    },
  } as any);
});

describe("saveFolderRuleAction", () => {
  it("creates a rule with a LABEL action when the folder has none", async () => {
    prisma.rule.findFirst.mockResolvedValue(null);
    prisma.rule.findUnique.mockResolvedValue(null);
    createRuleWithResolvedActionsMock.mockResolvedValue({ id: "rule-1" });

    const result = await saveFolderRuleAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      enabled: true,
      instructions: "Invoices and receipts",
      from: "@stripe.com",
      conditionalOperator: LogicalOperator.OR,
    });

    expect(result?.data).toEqual({ ruleId: "rule-1" });
    expect(createRuleWithResolvedActionsMock).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      data: {
        name: "Label: Billing",
        enabled: true,
        instructions: "Invoices and receipts",
        from: "@stripe.com",
        conditionalOperator: LogicalOperator.OR,
        runOnThreads: false,
      },
      actions: [
        { type: ActionType.LABEL, label: "Billing", labelId: "Label_1" },
      ],
    });
  });

  it("suffixes the rule name when 'Label: <name>' is taken", async () => {
    prisma.rule.findFirst.mockResolvedValue(null);
    prisma.rule.findUnique
      .mockResolvedValueOnce({ id: "clash" } as any)
      .mockResolvedValueOnce(null);
    createRuleWithResolvedActionsMock.mockResolvedValue({ id: "rule-2" });

    await saveFolderRuleAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      enabled: true,
      instructions: "Invoices",
      conditionalOperator: LogicalOperator.OR,
    });

    expect(createRuleWithResolvedActionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Label: Billing (2)" }),
      }),
    );
  });

  it("updates only the drawer-owned fields on an existing rule", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-1",
      organizationRuleId: null,
      actions: [{ type: ActionType.LABEL }, { type: ActionType.ARCHIVE }],
    } as any);

    await saveFolderRuleAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      enabled: false,
      instructions: "  ",
      from: "@stripe.com",
      conditionalOperator: LogicalOperator.AND,
    });

    // Older rules reference the label by name only — the lookup must match
    // either, so the drawer edits the same rule the Assistant page shows
    expect(prisma.rule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actions: {
            some: {
              type: ActionType.LABEL,
              OR: [{ labelId: "Label_1" }, { label: "Billing" }],
            },
          },
        }),
      }),
    );

    expect(createRuleWithResolvedActionsMock).not.toHaveBeenCalled();
    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-1", emailAccountId: "account-1" },
      data: {
        enabled: false,
        instructions: null,
        from: "@stripe.com",
        conditionalOperator: LogicalOperator.AND,
      },
    });
  });

  it("rejects when both instructions and senders are empty", async () => {
    const result = await saveFolderRuleAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      enabled: true,
      instructions: "",
      from: "  ",
      conditionalOperator: LogicalOperator.OR,
    });

    expect(result?.validationErrors).toBeTruthy();
    expect(prisma.rule.update).not.toHaveBeenCalled();
    expect(createRuleWithResolvedActionsMock).not.toHaveBeenCalled();
  });

  it("refuses to edit an organization-managed rule", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-1",
      organizationRuleId: "org-rule-1",
      actions: [{ type: ActionType.LABEL }],
    } as any);

    const result = await saveFolderRuleAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      enabled: true,
      instructions: "Invoices",
      conditionalOperator: LogicalOperator.OR,
    });

    expect(result?.serverError).toBeTruthy();
    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("blocks adding a spoofable From to a rule with outbound actions", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-1",
      organizationRuleId: null,
      actions: [{ type: ActionType.LABEL }, { type: ActionType.FORWARD }],
    } as any);

    const result = await saveFolderRuleAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      enabled: true,
      from: "Stripe Billing",
      conditionalOperator: LogicalOperator.OR,
    });

    expect(result?.serverError).toBeTruthy();
    expect(prisma.rule.update).not.toHaveBeenCalled();
  });
});
