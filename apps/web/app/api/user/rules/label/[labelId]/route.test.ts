import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { GET } from "./route";

describe("GET /api/user/rules/label/[labelId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rule.findMany.mockResolvedValue([
      createFilingRule({ actions: [{ type: ActionType.LABEL }] }),
    ] as any);
  });

  it("reports the scoped mode for a live companion rule", async () => {
    prisma.rule.findUnique.mockResolvedValue(
      createCompanionRule({ fromExclude: true }) as any,
    );

    const body = await getFolderRule();

    expect(body.autoRead).toEqual({
      mode: "except",
      senders: "noreply@acme.com",
    });
  });

  it("reports auto-read off when the companion rule is disabled", async () => {
    prisma.rule.findUnique.mockResolvedValue(
      createCompanionRule({ enabled: false }) as any,
    );

    const body = await getFolderRule();

    expect(body.autoRead.mode).toBe("off");
  });

  it("reports auto-read off when the companion rule no longer marks read", async () => {
    prisma.rule.findUnique.mockResolvedValue(
      createCompanionRule({ actions: [{ type: ActionType.LABEL }] }) as any,
    );

    const body = await getFolderRule();

    expect(body.autoRead.mode).toBe("off");
  });

  it("reports auto-read for the whole folder from the filing rule", async () => {
    prisma.rule.findUnique.mockResolvedValue(null);
    prisma.rule.findMany.mockResolvedValue([
      createFilingRule({
        actions: [{ type: ActionType.LABEL }, { type: ActionType.MARK_READ }],
      }),
    ] as any);

    const body = await getFolderRule();

    expect(body.autoRead).toEqual({ mode: "all", senders: "" });
  });

  it("rejects a label id that isn't decodable instead of failing with a 500", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/rules/label/%E0%A4%A"),
      { params: Promise.resolve({ labelId: "%E0%A4%A" }) } as any,
    );

    expect(response.status).toBe(400);
    expect(prisma.rule.findMany).not.toHaveBeenCalled();
  });
});

async function getFolderRule() {
  const response = await GET(
    new NextRequest(
      "http://localhost:3000/api/user/rules/label/Label_1?name=Receipts",
    ),
    { params: Promise.resolve({ labelId: "Label_1" }) } as any,
  );
  expect(response.status).toBe(200);
  return await response.json();
}

function createCompanionRule({
  enabled = true,
  fromExclude = false,
  actions = [{ type: ActionType.LABEL }, { type: ActionType.MARK_READ }],
}: {
  enabled?: boolean;
  fromExclude?: boolean;
  actions?: { type: ActionType }[];
} = {}) {
  return {
    from: "noreply@acme.com",
    fromExclude,
    enabled,
    actions,
  };
}

function createFilingRule({ actions }: { actions: { type: ActionType }[] }) {
  return {
    id: "rule-1",
    name: "Receipts",
    enabled: true,
    instructions: null,
    from: null,
    conditionalOperator: "AND",
    organizationRuleId: null,
    systemType: null,
    excludeKnownContacts: false,
    actions,
  };
}
