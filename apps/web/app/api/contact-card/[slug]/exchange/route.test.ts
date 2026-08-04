import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const { mockSubmitContactCardExchange } = vi.hoisted(() => ({
  mockSubmitContactCardExchange: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/contact-card/exchange", () => ({
  submitContactCardExchange: mockSubmitContactCardExchange,
}));

import { POST } from "./route";

describe("contact card exchange route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmitContactCardExchange.mockResolvedValue({ received: true });
  });

  it("hands a valid submission to the card", async () => {
    const response = await postExchange(
      JSON.stringify({ name: "Jane Rivera", email: "jane@company.com" }),
    );

    expect(response.status).toBe(200);
    expect(mockSubmitContactCardExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "chris",
        submission: expect.objectContaining({ email: "jane@company.com" }),
      }),
    );
  });

  // A body that isn't JSON is a client mistake: it must surface as the
  // validation error the middleware answers 400 for, not an unhandled 500
  it("treats a malformed body as a validation error", async () => {
    await expect(postExchange("not json")).rejects.toThrow(ZodError);
    expect(mockSubmitContactCardExchange).not.toHaveBeenCalled();
  });
});

function postExchange(body: string) {
  const request = new NextRequest(
    "http://localhost:3000/api/contact-card/chris/exchange",
    {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    },
  );

  return POST(request, { params: Promise.resolve({ slug: "chris" }) });
}
