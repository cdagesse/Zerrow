import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  createEmailProviderMock,
  getEmailAccountWithAiAndTokensMock,
  aiEnrichContactMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  getEmailAccountWithAiAndTokensMock: vi.fn(),
  aiEnrichContactMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: getEmailAccountWithAiAndTokensMock,
}));
vi.mock("@/utils/ai/contacts/enrich-contact", () => ({
  aiEnrichContact: aiEnrichContactMock,
}));

import { enrichContactAction } from "@/utils/actions/contact";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: { userId: "user-1", provider: "google" },
  } as any);
  getEmailAccountWithAiAndTokensMock.mockResolvedValue({
    id: "account-1",
    email: "user@example.com",
    user: {},
  });
  prisma.contact.findUnique.mockResolvedValue(null);
  prisma.contact.upsert.mockResolvedValue({} as any);
});

describe("enrichContactAction", () => {
  it("returns suggestions and persists only the AI summary", async () => {
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "m1",
            headers: { from: "jane@example.com", subject: "Re: Order" },
          },
        ],
      }),
    });
    aiEnrichContactMock.mockResolvedValue({
      name: "Jane Doe",
      title: "VP of Sales",
      company: "Example Corp",
      phones: ["+1 555 0100"],
      summary: "Jane is the user's account manager at Example Corp.",
    });

    const result = await enrichContactAction("account-1", {
      email: "Jane@Example.com",
    });

    expect(result?.data?.suggestions).toEqual({
      name: "Jane Doe",
      title: "VP of Sales",
      company: "Example Corp",
      phones: ["+1 555 0100"],
    });
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId_email: {
            emailAccountId: "account-1",
            email: "jane@example.com",
          },
        },
        update: {
          aiSummary: "Jane is the user's account manager at Example Corp.",
        },
      }),
    );
  });

  it("explains when there are no emails from the contact", async () => {
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({ messages: [] }),
    });

    const result = await enrichContactAction("account-1", {
      email: "jane@example.com",
    });

    expect(result?.serverError).toContain("No emails from this contact");
    expect(aiEnrichContactMock).not.toHaveBeenCalled();
  });

  it("surfaces the underlying cause when the AI call fails", async () => {
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({
        messages: [
          { id: "m1", headers: { from: "jane@example.com", subject: "Hi" } },
        ],
      }),
    });
    aiEnrichContactMock.mockRejectedValue(
      new Error("Your credit balance is too low"),
    );

    const result = await enrichContactAction("account-1", {
      email: "jane@example.com",
    });

    expect(result?.serverError).toContain("Your credit balance is too low");
  });
});
