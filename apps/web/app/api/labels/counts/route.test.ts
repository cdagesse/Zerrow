import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmailProvider, mockLogger } = vi.hoisted(() => ({
  mockEmailProvider: {
    getLabels: vi.fn(),
    getUnreadCounts: vi.fn(),
  },
  mockLogger: {
    error: vi.fn(),
  },
}));

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

describe("GET /api/labels/counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailProvider.getUnreadCounts.mockImplementation(
      async (labelIds: string[]) =>
        Object.fromEntries(labelIds.map((id) => [id, 1])),
    );
  });

  it("returns a count for every label, not just the first batch", async () => {
    const labelIds = Array.from({ length: 45 }, (_, index) => `Label_${index}`);
    mockEmailProvider.getLabels.mockResolvedValue(
      labelIds.map((id) => ({ id, name: id, type: "user" })),
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/labels/counts"),
      {} as any,
    );
    const body = await response.json();

    expect(Object.keys(body.counts).sort()).toEqual(
      ["INBOX", ...labelIds].sort(),
    );
    // Each id costs a provider call, so the fan-out per lookup stays bounded
    for (const [batch] of mockEmailProvider.getUnreadCounts.mock.calls) {
      expect(batch.length).toBeLessThanOrEqual(30);
    }
  });
});
