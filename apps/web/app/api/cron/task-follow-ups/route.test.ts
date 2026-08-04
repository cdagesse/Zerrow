import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  taskStore,
  findManyMock,
  updateManyMock,
  hasCronSecretMock,
  processTaskFollowUpMock,
  getEmailAccountWithAiAndTokensMock,
  createEmailProviderMock,
} = vi.hoisted(() => {
  // One row shared by every run in a test, so a claim by one invocation is
  // visible to the others exactly as it would be in the database
  const taskStore = {
    id: "task-1",
    emailAccountId: "account-1",
    nextFollowUpAt: new Date("2026-08-03T09:00:00Z") as Date | null,
  };

  return {
    taskStore,
    findManyMock: vi.fn(async () => [
      {
        id: taskStore.id,
        emailAccountId: taskStore.emailAccountId,
        nextFollowUpAt: taskStore.nextFollowUpAt,
        emailAccount: {
          id: "account-1",
          name: "Chris",
          account: { provider: "google" },
        },
        subtasks: [],
        emails: [],
        activity: [],
      },
    ]),
    updateManyMock: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; nextFollowUpAt: Date };
        data: { nextFollowUpAt: Date };
      }) => {
        const matches =
          where.id === taskStore.id &&
          taskStore.nextFollowUpAt?.getTime() ===
            where.nextFollowUpAt.getTime();

        if (!matches) return { count: 0 };

        taskStore.nextFollowUpAt = data.nextFollowUpAt;
        return { count: 1 };
      },
    ),
    hasCronSecretMock: vi.fn(() => true),
    processTaskFollowUpMock: vi.fn(async () => "sent"),
    getEmailAccountWithAiAndTokensMock: vi.fn(async () => ({
      id: "account-1",
      email: "chris@nucar.com",
    })),
    createEmailProviderMock: vi.fn(async () => ({})),
  };
});

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/cron", () => ({
  hasCronSecret: hasCronSecretMock,
  hasPostCronSecret: vi.fn(async () => true),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    task: { findMany: findManyMock, updateMany: updateManyMock },
  },
}));

vi.mock("@/utils/premium", () => ({
  getPremiumUserFilter: () => ({}),
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: getEmailAccountWithAiAndTokensMock,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));

vi.mock("@/utils/task-follow-up", () => ({
  processTaskFollowUp: processTaskFollowUpMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

describe("cron/task-follow-ups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskStore.nextFollowUpAt = new Date("2026-08-03T09:00:00Z");
    hasCronSecretMock.mockReturnValue(true);
    processTaskFollowUpMock.mockResolvedValue("sent");
  });

  it("sends the follow-up for a due task", async () => {
    const response = await GET(createRequest() as never);

    expect(await response.json()).toMatchObject({
      due: 1,
      sent: 1,
      skipped: 0,
    });
    expect(processTaskFollowUpMock).toHaveBeenCalledTimes(1);
  });

  it("sends only one follow-up when two runs overlap on the same due task", async () => {
    const [first, second] = await Promise.all([
      GET(createRequest() as never),
      GET(createRequest() as never),
    ]);

    // The assignee must not receive the same check-in twice
    expect(processTaskFollowUpMock).toHaveBeenCalledTimes(1);

    const results = [await first.json(), await second.json()];
    expect(results.map((result) => result.sent).sort()).toEqual([0, 1]);
    expect(results.map((result) => result.skipped).sort()).toEqual([0, 1]);
  });

  it("leaves the task off the due list while it is being processed", async () => {
    const now = new Date("2026-08-03T10:00:00Z");
    vi.setSystemTime(now);

    await GET(createRequest() as never);

    expect(taskStore.nextFollowUpAt?.getTime()).toBeGreaterThan(now.getTime());

    vi.useRealTimers();
  });

  it("does not claim anything when the cron secret is missing", async () => {
    hasCronSecretMock.mockReturnValue(false);

    const response = await GET(createRequest() as never);

    expect(response.status).toBe(401);
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(processTaskFollowUpMock).not.toHaveBeenCalled();
  });
});

function createRequest() {
  return new Request("https://app.test/api/cron/task-follow-ups");
}
