import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createEmailProviderMock } = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
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

import { updateLabelAction, updateLabelsAction } from "@/utils/actions/mail";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: {
      userId: "user-1",
      provider: "google",
    },
  } as any);
});

describe("updateLabelsAction", () => {
  it("upserts enabled labels and only deletes the names marked disabled", async () => {
    await updateLabelsAction("account-1", {
      labels: [
        {
          name: "Billing",
          description: "Invoices",
          enabled: true,
          gmailLabelId: "Label_1",
        },
        {
          name: "Old",
          enabled: false,
          gmailLabelId: "Label_2",
        },
      ],
    });

    expect(prisma.label.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name_emailAccountId: {
            name: "Billing",
            emailAccountId: "account-1",
          },
        },
      }),
    );

    // The delete must be scoped to the explicitly-disabled names — never a
    // blanket delete of rows missing from the payload.
    expect(prisma.label.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        name: { in: ["Old"] },
      },
    });
  });

  it("does not delete anything when all labels are enabled", async () => {
    await updateLabelsAction("account-1", {
      labels: [
        {
          name: "Billing",
          enabled: true,
          gmailLabelId: "Label_1",
        },
      ],
    });

    expect(prisma.label.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        name: { in: [] },
      },
    });
  });
});

describe("updateLabelAction", () => {
  it("keeps the row (with description) when disabling a folder", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      description: "Invoices",
      enabled: false,
      gmailLabelId: "Label_1",
    });

    expect(prisma.label.upsert).toHaveBeenCalledWith({
      where: {
        name_emailAccountId: {
          name: "Billing",
          emailAccountId: "account-1",
        },
      },
      create: {
        gmailLabelId: "Label_1",
        name: "Billing",
        description: "Invoices",
        enabled: false,
        emailAccountId: "account-1",
        icon: undefined,
      },
      update: {
        name: "Billing",
        description: "Invoices",
        enabled: false,
        gmailLabelId: "Label_1",
        icon: undefined,
      },
    });
    expect(prisma.label.deleteMany).not.toHaveBeenCalled();
  });

  it("persists a chosen icon", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      enabled: true,
      gmailLabelId: "Label_1",
      icon: "receipt",
    });

    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ icon: "receipt" }),
        update: expect.objectContaining({ icon: "receipt" }),
      }),
    );
  });

  it("leaves the stored icon untouched when the save omits it", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      description: "Invoices",
      enabled: true,
      gmailLabelId: "Label_1",
    });

    // undefined means "don't change" in prisma updates — the AI settings
    // save must not clear an icon picked earlier
    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ icon: undefined }),
      }),
    );
  });
});
