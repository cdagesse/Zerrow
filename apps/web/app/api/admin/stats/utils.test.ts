import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/middleware", () => ({
  withAdmin: vi.fn(),
}));

import { resolveDateRange } from "./utils";

const NOW = new Date("2026-08-03T12:00:00.000Z");

describe("resolveDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats absent bounds as the epoch and now", () => {
    const range = resolveDateRange({});

    expect(range.from).toEqual(new Date(0));
    expect(range.to).toEqual(NOW);
  });

  // 0 is falsy but a real bound, so a `toDate` of the epoch used to be read as
  // "no bound", quietly widening the window to everything up to now.
  it("keeps an epoch bound rather than reading it as absent", () => {
    const range = resolveDateRange({ fromDate: 0, toDate: 0 });

    expect(range.from).toEqual(new Date(0));
    expect(range.to).toEqual(new Date(0));
  });

  // A far-future bound made the signups route build a chart point for every day
  // until then, which is hundreds of millions of allocations per request.
  it("clamps a far-future toDate to now", () => {
    const range = resolveDateRange({ toDate: 8_640_000_000_000_000 });

    expect(range.to).toEqual(NOW);
  });

  it("clamps a pre-epoch fromDate to the epoch", () => {
    const range = resolveDateRange({ fromDate: -8_640_000_000_000_000 });

    expect(range.from).toEqual(new Date(0));
  });

  it("clamps a future fromDate to now", () => {
    const range = resolveDateRange({ fromDate: NOW.getTime() + 86_400_000 });

    expect(range.from).toEqual(NOW);
    expect(range.to).toEqual(NOW);
  });

  it("rejects an inverted range", () => {
    expect(() =>
      resolveDateRange({
        fromDate: new Date("2026-07-01T00:00:00.000Z").getTime(),
        toDate: new Date("2026-06-01T00:00:00.000Z").getTime(),
      }),
    ).toThrow("fromDate must not be after toDate");
  });
});
