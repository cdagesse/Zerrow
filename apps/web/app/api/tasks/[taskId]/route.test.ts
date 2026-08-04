import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { GET } from "./route";

// The test middleware authenticates as email-account-1
const OWN_ACCOUNT = "email-account-1";
const OTHER_ACCOUNT = "email-account-2";

const ownTask = {
  id: "task-1",
  emailAccountId: OWN_ACCOUNT,
  emails: [
    {
      id: "task-email-1",
      threadId: "thread-1",
      messageId: "message-1",
      from: "sender@example.com",
      subject: "Quarterly numbers",
      snippet: "Here are the numbers",
      receivedAt: new Date("2026-01-02"),
      attachments: [
        {
          attachmentId: "attachment-1",
          filename: "numbers.pdf",
          mimeType: "application/pdf",
          size: 1024,
        },
      ],
    },
  ],
};

const otherAccountsTask = {
  id: "task-2",
  emailAccountId: OTHER_ACCOUNT,
  emails: [
    {
      id: "task-email-2",
      threadId: "thread-2",
      messageId: "message-2",
      from: "private@example.com",
      subject: "Someone else's mail",
      snippet: "Not yours",
      receivedAt: null,
      attachments: null,
    },
  ],
};

describe("GET /api/tasks/[taskId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Stand in for the database: match only on the keys the query actually
    // filters by, the way Prisma would. A route that drops emailAccountId from
    // its where clause therefore reads another account's task, and the
    // authorization test below fails instead of passing by accident.
    prisma.task.findFirst.mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      [ownTask, otherAccountsTask].find((task) =>
        Object.entries(args.where).every(
          ([field, value]) => task[field as keyof typeof task] === value,
        ),
      )) as never);
  });

  it("returns the task's linked emails with their attachments", async () => {
    const response = await callGet("task-1");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.emails).toHaveLength(1);
    expect(body.emails[0]).toMatchObject({
      messageId: "message-1",
      from: "sender@example.com",
      subject: "Quarterly numbers",
      snippet: "Here are the numbers",
    });
    expect(body.emails[0].attachments[0].filename).toBe("numbers.pdf");
  });

  it("refuses a task belonging to another email account", async () => {
    const response = await callGet("task-2");

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Task not found." });
    expect(JSON.stringify(body)).not.toContain("Someone else's mail");
  });

  it("scopes the query to the authenticated email account", async () => {
    await callGet("task-1");

    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1", emailAccountId: OWN_ACCOUNT },
      }),
    );
  });

  it("returns 404 for a task that does not exist", async () => {
    const response = await callGet("missing-task");

    expect(response.status).toBe(404);
  });
});

function callGet(taskId: string) {
  return GET(
    new Request(`http://localhost/api/tasks/${taskId}`) as never,
    {
      params: Promise.resolve({ taskId }),
    } as never,
  );
}
