import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckRateLimit, mockRecordContactCardClick } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockRecordContactCardClick: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/contact-card/views", async () => {
  const actual = await vi.importActual<
    typeof import("@/utils/contact-card/views")
  >("@/utils/contact-card/views");

  return {
    CARD_CLICK_KINDS: actual.CARD_CLICK_KINDS,
    recordContactCardClick: mockRecordContactCardClick,
  };
});

vi.mock("@/utils/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimitKey: (parts: string[]) => parts.join(":"),
  getClientIp: () => "203.0.113.9",
}));

import { POST } from "./route";

describe("contact card click route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ limited: false });
    mockRecordContactCardClick.mockResolvedValue(undefined);
  });

  it("records the tap when under the limit", async () => {
    const response = await postClick();

    expect(response.status).toBe(200);
    expect(mockRecordContactCardClick).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "chris", kind: "phone" }),
    );
  });

  // Taps aren't deduped, so an unlimited beacon inflates the owner's numbers
  it("refuses to record once the visitor's limit trips", async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true });

    const response = await postClick();

    expect(response.status).toBe(429);
    expect(mockRecordContactCardClick).not.toHaveBeenCalled();
  });

  // One bucket per card, so a noisy visitor on one card doesn't stop others
  it("scopes the limit to the card as well as the visitor", async () => {
    await postClick();

    const { key } = mockCheckRateLimit.mock.calls[0][0].rule;
    expect(key).toContain("chris");
    expect(key).toContain("203.0.113.9");
  });

  it("rejects an unknown click kind", async () => {
    const response = await postClick({ kind: "wallet" });

    expect(response.status).toBe(400);
    expect(mockRecordContactCardClick).not.toHaveBeenCalled();
  });
});

function postClick({ kind = "phone" }: { kind?: string } = {}) {
  const request = new NextRequest(
    "http://localhost:3000/api/contact-card/chris/click",
    {
      method: "POST",
      body: JSON.stringify({ kind }),
      headers: { "content-type": "application/json" },
    },
  );

  return POST(request, { params: Promise.resolve({ slug: "chris" }) });
}
