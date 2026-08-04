import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockEmailProvider, mockLogger } = vi.hoisted(() => ({
  mockEmailProvider: {
    getThreadsWithQuery: vi.fn(),
  },
  mockLogger: {
    error: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (_scope: string, handler: (request: any) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1", userId: "user-1" },
          emailProvider: mockEmailProvider,
          logger: mockLogger,
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the plan badge on a thread whose executions are older than another thread's history", async () => {
    // Bulk processing requeues threads without a plan, so a dropped badge
    // re-applies actions to mail that was already processed
    mockProviderThreads(["thread-busy", "thread-quiet"]);
    mockExecutedRules([
      ...Array.from({ length: 6 }, (_, index) =>
        createExecutedRule({
          id: `busy-${index}`,
          threadId: "thread-busy",
          createdAt: new Date(`2026-05-10T00:0${index}:00.000Z`),
        }),
      ),
      createExecutedRule({
        id: "quiet-1",
        threadId: "thread-quiet",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ]);

    const body = await getThreads("?limit=2");

    expect(planFor(body, "thread-quiet")).toMatchObject({ id: "quiet-1" });
    expect(planFor(body, "thread-busy")).toMatchObject({ id: "busy-5" });
  });

  it("hides the plan when the newest execution came from a disabled rule", async () => {
    mockProviderThreads(["thread-1"]);
    mockExecutedRules([
      createExecutedRule({
        id: "newest",
        threadId: "thread-1",
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
        rule: { id: "rule-off", name: "Archived receipts", enabled: false },
      }),
      createExecutedRule({
        id: "older",
        threadId: "thread-1",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        rule: { id: "rule-on", name: "Receipts", enabled: true },
      }),
    ]);

    const body = await getThreads();

    expect(planFor(body, "thread-1")).toBeUndefined();
  });

  it("still shows the newest execution when its rule was deleted", async () => {
    mockProviderThreads(["thread-1"]);
    mockExecutedRules([
      createExecutedRule({
        id: "newest",
        threadId: "thread-1",
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
        rule: null,
      }),
    ]);

    const body = await getThreads();

    expect(planFor(body, "thread-1")).toMatchObject({ id: "newest" });
  });
});

async function getThreads(search = "") {
  const response = await GET(
    new NextRequest(`http://localhost:3000/api/threads${search}`),
    {} as any,
  );
  expect(response.status).toBe(200);
  return await response.json();
}

function planFor(body: any, threadId: string) {
  return body.threads.find((thread: any) => thread.id === threadId)?.plan;
}

function mockProviderThreads(threadIds: string[]) {
  mockEmailProvider.getThreadsWithQuery.mockResolvedValue({
    threads: threadIds.map((id) => ({
      id,
      snippet: "snippet",
      messages: [
        { id: `${id}-message`, headers: { from: "sender@example.com" } },
      ],
    })),
    nextPageToken: null,
  });
}

type ExecutedRuleRow = ReturnType<typeof createExecutedRule>;

function mockExecutedRules(rows: ExecutedRuleRow[]) {
  prisma.executedRule.findMany.mockImplementation((args: any) =>
    queryExecutedRules(rows, args),
  );
}

// Answers the route's query the way the database would: the newest rows for
// the requested threads, then whatever take/distinct was asked for. `take`
// truncates rows before `distinct` can dedupe them, so a global cap hides
// whole threads' history behind one heavily-reprocessed thread.
function queryExecutedRules(rows: ExecutedRuleRow[], args: any) {
  const threadIds: string[] = args.where.threadId.in;
  let result = rows
    .filter((row) => threadIds.includes(row.threadId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (args.take) result = result.slice(0, args.take);

  if (args.distinct?.includes("threadId")) {
    const seen = new Set<string>();
    result = result.filter((row) => {
      if (seen.has(row.threadId)) return false;
      seen.add(row.threadId);
      return true;
    });
  }

  return result as any;
}

function createExecutedRule({
  id,
  threadId,
  createdAt,
  rule = { id: "rule-1", name: "Receipts", enabled: true },
}: {
  id: string;
  threadId: string;
  createdAt: Date;
  rule?: { id: string; name: string; enabled: boolean } | null;
}) {
  return {
    id,
    threadId,
    messageId: `${threadId}-message`,
    createdAt,
    rule,
    actionItems: [],
    status: "APPLIED",
    reason: null,
  };
}
