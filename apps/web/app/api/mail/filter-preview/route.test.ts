import { NextRequest } from "next/server";
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

type CachedMessage = {
  from: string;
  fromDomain: string;
  inbox: boolean;
  date: Date;
};

describe("GET /api/mail/filter-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts cached messages whose domain is stored with different casing", async () => {
    // Cached domains keep the sender header's casing, and the rule this
    // previews matches case-insensitively
    mockCachedMessages([
      createMessage({ from: "News@Acme.com", fromDomain: "Acme.com" }),
      createMessage({ from: "sales@acme.com", fromDomain: "acme.com" }),
      createMessage({ from: "hi@other.com", fromDomain: "other.com" }),
    ]);

    const body = await getPreview("matchType=domain&value=%40acme.com");

    expect(body).toMatchObject({ countable: true, total: 2, inbox: 2 });
  });

  it("counts senders case-insensitively", async () => {
    mockCachedMessages([
      createMessage({ from: "News@Acme.com", fromDomain: "Acme.com" }),
      createMessage({ from: "sales@acme.com", fromDomain: "acme.com" }),
    ]);

    const body = await getPreview("matchType=sender&value=news%40acme.com");

    expect(body).toMatchObject({ countable: true, total: 1 });
  });
});

async function getPreview(search: string) {
  const response = await GET(
    new NextRequest(`http://localhost:3000/api/mail/filter-preview?${search}`),
    {} as any,
  );
  expect(response.status).toBe(200);
  return await response.json();
}

function mockCachedMessages(messages: CachedMessage[]) {
  prisma.emailMessage.count.mockImplementation(
    (args: any) =>
      messages.filter((message) => matchesWhere(message, args.where))
        .length as any,
  );
}

// Evaluates the subset of Prisma's where syntax this route builds, so the
// counts a real database would return are what the test asserts on.
function matchesWhere(message: CachedMessage, where: any): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") {
      return (condition as any[]).some((clause) =>
        matchesWhere(message, clause),
      );
    }
    // Fields the cache stores but the fixtures don't vary
    if (key === "emailAccountId" || key === "sent" || key === "draft") {
      return true;
    }

    const value = message[key as keyof CachedMessage];
    if (condition === null || typeof condition !== "object") {
      return value === condition;
    }

    const filter = condition as {
      equals?: string;
      in?: string[];
      gte?: Date;
      mode?: string;
    };
    if (filter.gte) return (value as Date) >= filter.gte;

    const text = String(value);
    const insensitive = filter.mode === "insensitive";
    if (filter.in) {
      return filter.in.some((candidate) =>
        insensitive
          ? candidate.toLowerCase() === text.toLowerCase()
          : candidate === text,
      );
    }
    if (filter.equals !== undefined) {
      return insensitive
        ? filter.equals.toLowerCase() === text.toLowerCase()
        : filter.equals === text;
    }

    throw new Error(`Unsupported filter for ${key}`);
  });
}

function createMessage({
  from,
  fromDomain,
  inbox = true,
  date = new Date(),
}: {
  from: string;
  fromDomain: string;
  inbox?: boolean;
  date?: Date;
}): CachedMessage {
  return { from, fromDomain, inbox, date };
}
