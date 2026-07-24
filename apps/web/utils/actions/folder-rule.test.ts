import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  createEmailProviderMock,
  getEmailAccountWithAiAndTokensMock,
  aiGenerateFolderInstructionsMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  getEmailAccountWithAiAndTokensMock: vi.fn(),
  aiGenerateFolderInstructionsMock: vi.fn(),
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
vi.mock("@/utils/ai/label/generate-folder-instructions", () => ({
  aiGenerateFolderInstructions: aiGenerateFolderInstructionsMock,
}));

import { generateFolderInstructionsAction } from "@/utils/actions/folder-rule";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: {
      userId: "user-1",
      provider: "google",
    },
  } as any);
  getEmailAccountWithAiAndTokensMock.mockResolvedValue({
    id: "account-1",
    email: "user@example.com",
    user: {},
  });
});

describe("generateFolderInstructionsAction", () => {
  it("returns the AI draft built from the folder's recent emails", async () => {
    createEmailProviderMock.mockResolvedValue({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              headers: { from: "billing@stripe.com", subject: "Receipt" },
            },
          ],
        },
      ]),
    });
    aiGenerateFolderInstructionsMock.mockResolvedValue({
      instructions: "Receipts and invoices",
      senderPatterns: ["billing@stripe.com"],
    });

    const result = await generateFolderInstructionsAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
    });

    expect(result?.data).toEqual({
      instructions: "Receipts and invoices",
      senderPatterns: ["billing@stripe.com"],
    });
  });

  it("explains when the folder has no emails to learn from", async () => {
    createEmailProviderMock.mockResolvedValue({
      getThreadsWithLabel: vi.fn().mockResolvedValue([]),
    });

    const result = await generateFolderInstructionsAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
    });

    expect(result?.serverError).toContain("no emails to learn from");
    expect(aiGenerateFolderInstructionsMock).not.toHaveBeenCalled();
  });

  it("surfaces the underlying cause when the AI call fails, even for non-Error throwables", async () => {
    createEmailProviderMock.mockResolvedValue({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              headers: { from: "billing@stripe.com", subject: "Receipt" },
            },
          ],
        },
      ]),
    });
    // DOMException-like: has name/message but is not an Error instance
    aiGenerateFolderInstructionsMock.mockRejectedValue({
      name: "AbortError",
      message: "The operation was aborted",
    });

    const result = await generateFolderInstructionsAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
    });

    expect(result?.serverError).toContain(
      "AbortError: The operation was aborted",
    );
  });
});
