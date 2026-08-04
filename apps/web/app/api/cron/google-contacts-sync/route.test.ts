import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, pullGoogleContactsMock, hasCronSecretMock } = vi.hoisted(
  () => ({
    findManyMock: vi.fn(),
    pullGoogleContactsMock: vi.fn(),
    hasCronSecretMock: vi.fn(() => true),
  }),
);

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/cron", () => ({
  hasCronSecret: hasCronSecretMock,
  hasPostCronSecret: vi.fn(async () => true),
}));

vi.mock("@/utils/prisma", () => ({
  default: { emailAccount: { findMany: findManyMock } },
}));

vi.mock("@/utils/contacts-sync/google", () => ({
  pullGoogleContacts: pullGoogleContactsMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

describe("cron/google-contacts-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasCronSecretMock.mockReturnValue(true);
    findManyMock.mockResolvedValue([{ id: "account-1", email: "a@nucar.com" }]);
    pullGoogleContactsMock.mockResolvedValue({
      created: 1,
      updated: 0,
      deleted: 0,
      skipped: 0,
    });
  });

  // An unbounded run that always restarts from the same account never reaches
  // the accounts past its timeout
  it("takes a bounded batch of the least recently synced accounts", async () => {
    const response = await GET(createRequest() as never);

    expect(await response.json()).toEqual({ accounts: 1, synced: 1 });

    const [args] = findManyMock.mock.calls[0];
    expect(args.orderBy).toEqual({
      googleContactsSyncedAt: { sort: "asc", nulls: "first" },
    });
    expect(args.take).toBeGreaterThan(0);
  });

  it("keeps syncing the rest of the batch when one account fails", async () => {
    findManyMock.mockResolvedValue([
      { id: "account-1", email: "a@nucar.com" },
      { id: "account-2", email: "b@nucar.com" },
    ]);
    pullGoogleContactsMock.mockRejectedValueOnce(new Error("token revoked"));

    const response = await GET(createRequest() as never);

    expect(await response.json()).toEqual({ accounts: 2, synced: 1 });
  });
});

function createRequest() {
  return new Request("https://app.test/api/cron/google-contacts-sync");
}
