import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckRateLimit, mockRecordContactCardView } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockRecordContactCardView: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/contact-card/views", () => ({
  recordContactCardView: mockRecordContactCardView,
}));

vi.mock("@/utils/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimitKey: (parts: string[]) => parts.join(":"),
  getClientIp: () => "203.0.113.9",
}));

import { POST } from "./route";

describe("contact card view route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ limited: false });
    mockRecordContactCardView.mockResolvedValue({ counted: true });
  });

  it("counts the view when under the limit", async () => {
    const response = await postView();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ counted: true });
  });

  // A shared-NAT visitor, or a flood at one slug, must not stop unrelated
  // cards being counted — so the bucket is per card, not per visitor alone
  it("scopes the limit to the card as well as the visitor", async () => {
    await postView();

    const { key } = mockCheckRateLimit.mock.calls[0][0].rule;
    expect(key).toContain("chris");
    expect(key).toContain("203.0.113.9");
  });

  it("doesn't count the view once the limit trips", async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true });

    const response = await postView();

    expect(response.status).toBe(429);
    expect(mockRecordContactCardView).not.toHaveBeenCalled();
  });
});

function postView() {
  const request = new NextRequest(
    "http://localhost:3000/api/contact-card/chris/view",
    { method: "POST" },
  );

  return POST(request, { params: Promise.resolve({ slug: "chris" }) });
}
