import { describe, it, expect, vi, beforeEach } from "vitest";
import { getThreadsBatch } from "./thread";
import { getBatch } from "@/utils/gmail/batch";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/gmail/batch");
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe("getThreadsBatch", () => {
  const logger = createTestLogger();
  const accessToken = "token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches full format by default (no query string)", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce([
      { id: "t1", snippet: "hi", messages: [] },
    ]);

    await getThreadsBatch(["t1"], accessToken, logger);

    expect(getBatch).toHaveBeenCalledWith(
      ["t1"],
      "/gmail/v1/users/me/threads",
      accessToken,
      undefined,
    );
  });

  it("requests metadata format with the header allowlist when asked", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce([
      { id: "t1", snippet: "hi", messages: [] },
    ]);

    await getThreadsBatch(["t1"], accessToken, logger, { format: "metadata" });

    const queryString = vi.mocked(getBatch).mock.calls[0][3];
    expect(queryString).toContain("format=metadata");
    expect(queryString).toContain("metadataHeaders=From");
    expect(queryString).toContain("metadataHeaders=Subject");
  });

  it("keeps the metadata query string when retrying failed items", async () => {
    vi.mocked(getBatch)
      .mockResolvedValueOnce([
        {
          error: {
            code: 429,
            message: "Rate limit exceeded",
            errors: [{ reason: "rateLimitExceeded" }],
            status: "RESOURCE_EXHAUSTED",
          },
        },
      ])
      .mockResolvedValueOnce([{ id: "t1", snippet: "hi", messages: [] }]);

    await getThreadsBatch(["t1"], accessToken, logger, { format: "metadata" });

    expect(getBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getBatch).mock.calls[1][3]).toContain("format=metadata");
  });

  it("refetches threads that failed with a retryable error", async () => {
    vi.mocked(getBatch)
      .mockResolvedValueOnce([
        {
          error: {
            code: 429,
            message: "Rate limit exceeded",
            errors: [{ reason: "rateLimitExceeded" }],
            status: "RESOURCE_EXHAUSTED",
          },
        },
      ])
      .mockResolvedValueOnce([{ id: "t1", snippet: "hi", messages: [] }]);

    const result = await getThreadsBatch(["t1"], accessToken, logger);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  it("skips threads with a non-retryable error instead of returning them as valid", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce([
      { id: "t1", snippet: "ok", messages: [] },
      {
        error: {
          code: 404,
          message: "Not Found",
          errors: [{ reason: "notFound" }],
          status: "NOT_FOUND",
        },
      },
    ]);

    const result = await getThreadsBatch(["t1", "t2"], accessToken, logger);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
    expect(getBatch).toHaveBeenCalledTimes(1);
  });

  it("throws on a 401 batch error", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce([
      {
        error: {
          code: 401,
          message: "Invalid Credentials",
          errors: [{ reason: "authError" }],
          status: "UNAUTHENTICATED",
        },
      },
    ]);

    await expect(getThreadsBatch(["t1"], accessToken, logger)).rejects.toThrow(
      "Invalid access token",
    );
  });
});
