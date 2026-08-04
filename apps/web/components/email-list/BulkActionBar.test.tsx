/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQueueState = vi.fn();

vi.mock("@/store/archive-queue", () => ({
  useQueueState: (...args: Parameters<typeof mockUseQueueState>) =>
    mockUseQueueState(...args),
}));

import { BulkActionBar } from "@/components/email-list/BulkActionBar";

function renderBar() {
  return render(
    <BulkActionBar
      count={2}
      isProcessing={false}
      onProcessAi={vi.fn()}
      onMoveToFolder={vi.fn()}
      onArchive={vi.fn()}
      onDelete={vi.fn()}
      onClear={vi.fn()}
    />,
  );
}

function getButton(label: RegExp) {
  return screen.getByRole("button", { name: label }) as HTMLButtonElement;
}

describe("BulkActionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("blocks further bulk actions while an archive is still queued", () => {
    mockUseQueueState.mockReturnValue({
      totalThreads: 2,
      activeThreads: {
        "archive-thread-1": { threadId: "thread-1", actionType: "archive" },
      },
    });

    renderBar();

    expect(getButton(/^Archive/).disabled).toBe(true);
    expect(getButton(/^Delete/).disabled).toBe(true);
    expect(getButton(/^Move to folder/).disabled).toBe(true);
    // The user can always dismiss the bar
    expect(getButton(/Clear selection/).disabled).toBe(false);
  });

  it("stays usable once the queue has drained", () => {
    mockUseQueueState.mockReturnValue({ totalThreads: 2, activeThreads: {} });

    renderBar();

    expect(getButton(/^Archive/).disabled).toBe(false);
    expect(getButton(/^Delete/).disabled).toBe(false);
  });

  // Opening any email queues a mark-read request, which can't conflict with a
  // bulk action, so it must not block the bar
  it("stays usable while only a mark-read request is queued", () => {
    mockUseQueueState.mockReturnValue({
      totalThreads: 1,
      activeThreads: {
        "markRead-thread-1": { threadId: "thread-1", actionType: "markRead" },
      },
    });

    renderBar();

    expect(getButton(/^Archive/).disabled).toBe(false);
    expect(getButton(/^Delete/).disabled).toBe(false);
  });
});
