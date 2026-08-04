import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { SafeError } from "@/utils/error";
import { createRuleTool } from "./tools/rules/create-rule-tool";
import {
  applyApprovedRuleUpdate,
  updateRuleTool,
} from "./tools/rules/update-rule-tool";
import { deleteRuleTool } from "./tools/rules/delete-rule-tool";

const {
  mockCreateRule,
  mockOutboundActionsNeedChatRiskConfirmation,
  mockPartialUpdateRule,
  mockPrisma,
  mockSetRuleEnabled,
  mockUpdateRuleActions,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockOutboundActionsNeedChatRiskConfirmation: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockSetRuleEnabled: vi.fn(),
  mockUpdateRuleActions: vi.fn(),
  mockPrisma: {
    emailAccount: {
      findUnique: vi.fn(),
    },
    rule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();

  return {
    ...actual,
    createRule: mockCreateRule,
    outboundActionsNeedChatRiskConfirmation:
      mockOutboundActionsNeedChatRiskConfirmation,
    partialUpdateRule: mockPartialUpdateRule,
    setRuleEnabled: mockSetRuleEnabled,
    updateRuleActions: mockUpdateRuleActions,
  };
});

const logger = createTestLogger();

const defaultActions = [
  {
    type: ActionType.LABEL,
    fields: { label: "Action" },
    delayInMinutes: null,
  },
];

describe("createRuleTool overlap guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutboundActionsNeedChatRiskConfirmation.mockReturnValue({
      needsConfirmation: false,
      riskMessages: [],
    });
    mockCreateRule.mockResolvedValue({ id: "new-rule-id" });
    mockAssistantRuleSnapshot([
      {
        name: "Urgent Action Mail",
        instructions: "Only urgent requests from this sender domain.",
        from: "@company.example",
      },
      {
        name: "Vendor Billing",
        instructions: "Updated billing instructions.",
        from: "billing@vendor.example",
        subject: "invoice",
        conditionalOperator: "AND",
      },
    ]);
    mockPrisma.rule.findMany.mockResolvedValue([
      {
        name: "Team Mail",
        instructions: null,
        from: "@company.example",
        to: null,
        subject: null,
        group: {
          items: [
            {
              value: "store@company.example",
              exclude: true,
              type: GroupItemType.FROM,
            },
          ],
        },
      },
    ]);
  });

  it("blocks overlapping sender-only rules", async () => {
    const result = await createRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
    }).execute({
      name: "Action Mail",
      condition: {
        aiInstructions: null,
        static: { from: "@company.example" },
        conditionalOperator: null,
      },
      actions: defaultActions,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('overlaps the existing "Team Mail"');
    expect(mockCreateRule).not.toHaveBeenCalled();
  });

  // The schema advertises delayInMinutes and the model fills it in, but the
  // input builder hardcoded null, so "archive this an hour later" reported
  // success and created a rule with no delay.
  it("keeps the requested action delay", async () => {
    await createRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
    }).execute({
      name: "Delayed Archive",
      condition: {
        aiInstructions: "Receipts from the finance team.",
        static: {},
        conditionalOperator: null,
      },
      actions: [{ type: ActionType.ARCHIVE, fields: null, delayInMinutes: 60 }],
    });

    expect(mockCreateRule).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          actions: [expect.objectContaining({ delayInMinutes: 60 })],
        }),
      }),
    );
  });

  it("allows sender rules narrowed by semantic instructions", async () => {
    const result = await createRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
    }).execute({
      name: "Urgent Action Mail",
      condition: {
        aiInstructions: "Only urgent requests from this sender domain.",
        static: { from: "@company.example" },
        conditionalOperator: null,
      },
      actions: defaultActions,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        ruleId: "new-rule-id",
        currentRule: expect.objectContaining({
          name: "Urgent Action Mail",
        }),
      }),
    );
    expect(mockCreateRule).toHaveBeenCalledOnce();
  });
});

describe("updateRuleTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPartialUpdateRule.mockResolvedValue({ id: "rule-id" });
    mockAssistantRuleSnapshot([
      {
        name: "Vendor Billing",
        instructions: "Updated billing instructions.",
        from: "billing@vendor.example",
        subject: "invoice",
        conditionalOperator: "AND",
      },
    ]);
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Vendor Billing",
      enabled: true,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
      instructions: "Billing notices.",
      from: "billing@vendor.example",
      to: null,
      subject: "invoice",
      conditionalOperator: "AND",
      actions: [],
    });
  });

  it("preserves omitted static fields when patching one static condition", async () => {
    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        condition: {
          conditionalOperator: null,
          static: {
            subject: null,
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.currentRule).toEqual(
      expect.objectContaining({
        name: "Vendor Billing",
        conditions: expect.objectContaining({
          aiInstructions: "Updated billing instructions.",
        }),
      }),
    );
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        subject: null,
      },
    });
  });

  // The chat action schema can express 12 of the 16 ActionType values.
  // updateRuleActions replaces actions wholesale, so without an explicit
  // preserve list, asking the assistant to "also archive these" silently
  // deleted the rule's Slack notification.
  it("preserves action types the chat schema cannot express", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Vendor Billing",
      enabled: true,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
      instructions: "Billing notices.",
      from: "billing@vendor.example",
      to: null,
      subject: "invoice",
      conditionalOperator: "AND",
      actions: [
        { type: ActionType.NOTIFY_MESSAGING_CHANNEL },
        { type: ActionType.LABEL },
      ],
    });

    await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        actions: [
          {
            type: ActionType.LABEL,
            fields: { label: "Billing" },
            delayInMinutes: null,
          },
          { type: ActionType.ARCHIVE, fields: null, delayInMinutes: null },
        ],
      },
    });

    const call = mockUpdateRuleActions.mock.calls.at(-1)?.[0];
    expect(call?.preserveActionTypes).toContain(
      ActionType.NOTIFY_MESSAGING_CHANNEL,
    );
    // LABEL is expressible and was explicitly restated, so it must not be
    // preserved behind the model's back.
    expect(call?.preserveActionTypes).not.toContain(ActionType.LABEL);
  });

  // DRAFT_MESSAGING_CHANNEL is the messaging-channel variant of a draft reply
  // and the editor normalizes both it and DRAFT_EMAIL to one option. Blindly
  // preserving it alongside a restated DRAFT_EMAIL would leave the rule with
  // two draft actions where the user asked for one.
  it("does not preserve a draft channel action when the model restated a draft", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Vendor Billing",
      enabled: true,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
      instructions: "Billing notices.",
      from: "billing@vendor.example",
      to: null,
      subject: "invoice",
      conditionalOperator: "AND",
      actions: [{ type: ActionType.DRAFT_MESSAGING_CHANNEL }],
    });

    await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        actions: [
          { type: ActionType.DRAFT_EMAIL, fields: null, delayInMinutes: null },
        ],
      },
    });

    const call = mockUpdateRuleActions.mock.calls.at(-1)?.[0];
    expect(call?.preserveActionTypes).not.toContain(
      ActionType.DRAFT_MESSAGING_CHANNEL,
    );
  });

  // The blanket catch used to collapse every failure to "Failed to update
  // rule", discarding messages the model could have acted on -- sender-scope
  // overlaps, disabled action types, webhook validation, label resolution.
  // Guards throw SafeError with text worth showing — a sender-scope overlap, a
  // disabled action type, an unresolvable label. The approval path lets it
  // through so the action reports why, rather than a generic failure.
  it("surfaces the reason an approved write was rejected", async () => {
    mockPartialUpdateRule.mockRejectedValue(
      new SafeError(
        'Sender "@vendor.example" already belongs to the rule "Vendor Mail".',
      ),
    );

    await expect(
      applyApprovedRuleUpdate({
        ruleName: "Vendor Billing",
        updates: { condition: { static: { from: "@vendor.example" } } },
        emailAccountId: "email-account-id",
        provider: "google",
        logger,
      }),
    ).rejects.toThrow(/already belongs to the rule/);
  });

  it("strips copied rule fields from status-only updates before writing", async () => {
    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        name: "Vendor Billing",
        enabled: false,
        condition: {
          aiInstructions: "Billing notices.",
          clearAiInstructions: true,
          static: {
            from: "billing@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
        actions: [],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updatedName: "Vendor Billing",
        proposedUpdates: { enabled: false },
      }),
    );
    expect(mockPartialUpdateRule).not.toHaveBeenCalled();
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
    expect(mockSetRuleEnabled).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      enabled: false,
    });
  });

  it("returns alreadyApplied without writing when all requested fields match the rule", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(
      vendorBillingRuleWithActions(),
    );

    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        name: "Vendor Billing",
        condition: {
          aiInstructions: "Billing notices.",
          static: {
            from: "billing@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
        actions: vendorBillingActionsInput(),
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        alreadyApplied: true,
        currentRule: expect.objectContaining({
          name: "Vendor Billing",
        }),
      }),
    );
    expect(mockPartialUpdateRule).not.toHaveBeenCalled();
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("strips copied actions while applying a real condition change", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(
      vendorBillingRuleWithActions(),
    );

    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        condition: {
          aiInstructions: "Billing notices that need finance review.",
        },
        actions: vendorBillingActionsInput(),
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        proposedUpdates: {
          condition: {
            aiInstructions: "Billing notices that need finance review.",
          },
        },
      }),
    );
    expect(result.alreadyApplied).toBe(false);
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        instructions: "Billing notices that need finance review.",
      },
    });
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
  });

  it("applies static condition changes when copied instructions are included", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(
      vendorBillingRuleWithActions(),
    );

    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        condition: {
          aiInstructions: "Billing notices.",
          static: {
            from: "accounts@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        proposedUpdates: {
          condition: {
            aiInstructions: "Billing notices.",
            static: {
              from: "accounts@vendor.example",
              subject: "invoice",
            },
            conditionalOperator: "AND",
          },
        },
      }),
    );
    expect(result.alreadyApplied).toBe(false);
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        instructions: "Billing notices.",
        from: "accounts@vendor.example",
        subject: "invoice",
        conditionalOperator: "AND",
      },
    });
  });

  it("blocks updates after deletion is pending for the same rule", async () => {
    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
      hasPendingRuleDeletion: (ruleName) => ruleName === "Vendor Billing",
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        enabled: false,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Deletion is already pending");
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("keeps replacement AI instructions when clear flag is also present", async () => {
    const result = await approvingUpdateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        condition: {
          aiInstructions: "Updated billing instructions.",
          clearAiInstructions: true,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        instructions: "Updated billing instructions.",
      },
    });
  });
});

describe("deleteRuleTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetRuleEnabled.mockResolvedValue({ id: "rule-id", enabled: false });
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Team Mail",
      enabled: true,
      systemType: null,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
    });
  });

  it("returns a pending confirmation for deleting a custom rule", async () => {
    const result = await deleteRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Team Mail", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Team Mail",
    });

    expect(result).toEqual({
      success: true,
      actionType: "delete_rule",
      requiresConfirmation: true,
      confirmationState: "pending",
      ruleId: "rule-id",
      ruleName: "Team Mail",
      wasEnabled: true,
    });
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("blocks deleting default rules", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "To Reply",
      enabled: true,
      systemType: SystemType.TO_REPLY,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
    });

    const result = await deleteRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["To Reply", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "To Reply",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Default rules cannot be deleted");
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });
});

function mockAssistantRuleSnapshot(
  rules: Array<{
    name: string;
    instructions: string | null;
    from: string | null;
    subject?: string | null;
    conditionalOperator?: "AND" | "OR" | null;
  }>,
) {
  mockPrisma.emailAccount.findUnique.mockResolvedValue({
    about: null,
    rulesRevision: 4,
    rules: rules.map((rule) => ({
      name: rule.name,
      instructions: rule.instructions,
      updatedAt: new Date("2026-04-27T00:01:00.000Z"),
      from: rule.from,
      to: null,
      subject: rule.subject ?? null,
      conditionalOperator: rule.conditionalOperator ?? null,
      enabled: true,
      runOnThreads: true,
      actions: [],
    })),
    messagingChannels: [],
  });
}

function vendorBillingRuleWithActions() {
  return {
    id: "rule-id",
    name: "Vendor Billing",
    enabled: true,
    updatedAt: new Date("2026-04-27T00:00:00.000Z"),
    emailAccount: { rulesRevision: 3 },
    instructions: "Billing notices.",
    from: "billing@vendor.example",
    to: null,
    subject: "invoice",
    conditionalOperator: "AND",
    actions: [
      {
        type: ActionType.LABEL,
        content: null,
        label: "Vendor Billing",
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
        delayInMinutes: null,
      },
      {
        type: ActionType.ARCHIVE,
        content: null,
        label: null,
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
        delayInMinutes: null,
      },
    ],
  };
}

function vendorBillingActionsInput() {
  return [
    {
      type: ActionType.LABEL,
      fields: { label: "Vendor Billing" },
      delayInMinutes: null,
    },
    {
      type: ActionType.ARCHIVE,
      fields: {},
      delayInMinutes: null,
    },
  ];
}

// updateRule is a two-step write: the first call returns the change plus an
// approvalToken and writes nothing. These tests assert what gets written, so
// they take both steps. Tests that reject before the gate pass straight
// through.
describe("updateRuleTool approval gate", () => {
  const options = {
    email: "user@example.com",
    emailAccountId: "email-account-id",
    provider: "google",
    logger,
    getRuleReadState: () => ({
      readAt: Date.now(),
      rulesRevision: 3,
      ruleUpdatedAtByName: new Map([
        ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
      ]),
    }),
  } as Parameters<typeof updateRuleTool>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPartialUpdateRule.mockResolvedValue({ id: "rule-id" });
    mockAssistantRuleSnapshot([
      {
        name: "Vendor Billing",
        instructions: "Billing notices.",
        from: "billing@vendor.example",
        conditionalOperator: "AND",
      },
    ]);
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Vendor Billing",
      enabled: true,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
      instructions: "Billing notices.",
      from: "billing@vendor.example",
      to: null,
      subject: null,
      conditionalOperator: "AND",
      actions: [],
    });
  });

  const disable = { ruleName: "Vendor Billing", updates: { enabled: false } };

  it("writes nothing and returns the change for the user to approve", async () => {
    const result: any = await (updateRuleTool(options) as any).execute(disable);

    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationState).toBe("pending");
    expect(result.actionType).toBe("update_rule");
    expect(result.proposedUpdates).toMatchObject({ enabled: false });
    expect(mockPartialUpdateRule).not.toHaveBeenCalled();
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
  });

  // The model has no second call that writes and no token to mint: repeating
  // the call cannot apply the change, only re-propose it.
  it("still writes nothing when the model calls it repeatedly", async () => {
    const tool: any = updateRuleTool(options);

    await tool.execute(disable);
    const second: any = await tool.execute(disable);

    expect(second.requiresConfirmation).toBe(true);
    expect(mockPartialUpdateRule).not.toHaveBeenCalled();
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("applies the change once approved", async () => {
    await (updateRuleTool(options) as any).execute(disable);
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();

    const applied = await applyApprovedRuleUpdate({
      ruleName: "Vendor Billing",
      updates: { enabled: false },
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
    });

    expect(applied.ruleId).toBe("rule-id");
    expect(mockSetRuleEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "rule-id", enabled: false }),
    );
  });

  it("refuses to apply an approval for a rule that has since been deleted", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(null);

    await expect(
      applyApprovedRuleUpdate({
        ruleName: "Vendor Billing",
        updates: { enabled: false },
        emailAccountId: "email-account-id",
        provider: "google",
        logger,
      }),
    ).rejects.toThrow(/no longer exists/i);
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });
});

function approvingUpdateRuleTool(
  options: Parameters<typeof updateRuleTool>[0],
) {
  const tool = updateRuleTool(options);
  return {
    // Mirrors what the UI does: the tool proposes, the user approves, and the
    // confirmation path applies it from the same arguments.
    // biome-ignore lint/suspicious/noExplicitAny: mirrors the tool's loose shape
    execute: async (args: any): Promise<any> => {
      const proposal: any = await (tool as any).execute(args);
      if (!proposal?.requiresConfirmation) return proposal;

      const applied = await applyApprovedRuleUpdate({
        ruleName: args.ruleName,
        updates: args.updates,
        emailAccountId: options.emailAccountId,
        provider: options.provider,
        logger: options.logger,
      });

      const { requiresConfirmation, confirmationState, ...rest } = proposal;
      return { ...rest, ...applied };
    },
  };
}
