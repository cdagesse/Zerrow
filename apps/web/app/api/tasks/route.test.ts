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

describe("GET /api/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The list is warmed on every app navigation, so it must not grow with the
  // number of emails linked to a task
  it("returns an email count instead of the emails themselves", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        createdAt: new Date("2026-01-01"),
        status: "TODO",
        priority: "NORMAL",
        dueAt: null,
        activity: [],
        _count: { emails: 3 },
      },
    ] as never);

    const response = await callGet();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tasks[0]._count.emails).toBe(3);
    expect(body.tasks[0]).not.toHaveProperty("emails");
  });

  it("does not query linked emails for the list", async () => {
    prisma.task.findMany.mockResolvedValue([] as never);

    await callGet();

    const include = prisma.task.findMany.mock.calls[0]?.[0]?.include;
    expect(include?.emails).toBeUndefined();
    expect(include?._count).toEqual({ select: { emails: true } });
  });

  it("keeps the activity timeline bounded", async () => {
    prisma.task.findMany.mockResolvedValue([] as never);

    await callGet();

    const include = prisma.task.findMany.mock.calls[0]?.[0]?.include;
    expect(include?.activity).toMatchObject({ take: 50 });
  });
});

function callGet() {
  return GET(
    new Request("http://localhost/api/tasks") as never,
    {
      params: Promise.resolve({}),
    } as never,
  );
}
