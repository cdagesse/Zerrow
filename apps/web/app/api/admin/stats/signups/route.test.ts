import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withAdmin:
    (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request),
}));

import { GET } from "./route";

const NOW = new Date("2026-08-03T12:00:00.000Z");

describe("GET /api/admin/stats/signups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // "All time" sends no bounds, which resolves to the epoch. The series used to
  // start there, emitting a zero-filled point for every day since 1970.
  it("starts an unbounded series at the first day with a signup", async () => {
    mockDayCounts(
      [{ day: "2026-08-01", count: 3 }],
      [{ day: "2026-08-02", count: 1 }],
    );

    const result = await getSignups();

    expect(result).toEqual([
      { date: "Aug 01, 2026", Users: 3, Mailboxes: 0 },
      { date: "Aug 02, 2026", Users: 0, Mailboxes: 1 },
      { date: "Aug 03, 2026", Users: 0, Mailboxes: 0 },
    ]);
  });

  it("returns no points for an unbounded window with no signups", async () => {
    mockDayCounts([], []);

    expect(await getSignups()).toEqual([]);
  });

  // The zero fill is the point of the dense series for a window the caller
  // chose: a week with no signups still has to show seven empty days.
  it("keeps zero-filled days ahead of the first signup in a chosen window", async () => {
    mockDayCounts([{ day: "2026-08-03", count: 2 }], []);

    const result = await getSignups({
      fromDate: new Date("2026-08-01T00:00:00.000Z").getTime(),
      toDate: NOW.getTime(),
    });

    expect(result.map((point) => point.Users)).toEqual([0, 0, 2]);
  });

  it("rejects an inverted window before querying", async () => {
    await expect(
      getSignups({
        fromDate: new Date("2026-08-02T00:00:00.000Z").getTime(),
        toDate: new Date("2026-08-01T00:00:00.000Z").getTime(),
      }),
    ).rejects.toThrow("fromDate must not be after toDate");

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

function mockDayCounts(
  users: { day: string; count: number }[],
  mailboxes: { day: string; count: number }[],
) {
  prisma.$queryRaw
    .mockResolvedValueOnce(users as never)
    .mockResolvedValueOnce(mailboxes as never);
}

async function getSignups(range?: { fromDate?: number; toDate?: number }) {
  const response = await GET(createRequest(range), {
    params: Promise.resolve({}),
  });
  const body = await response.json();

  return body.result;
}

function createRequest(range?: { fromDate?: number; toDate?: number }) {
  const params = new URLSearchParams();
  if (range?.fromDate !== undefined) {
    params.set("fromDate", String(range.fromDate));
  }
  if (range?.toDate !== undefined) params.set("toDate", String(range.toDate));

  return new Request(
    `https://example.com/api/admin/stats/signups?${params}`,
  ) as NextRequest;
}
