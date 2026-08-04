/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCreateGroup = vi.fn();
const executeLearn = vi.fn();
const mutate = vi.fn();

let isCreatingGroup = false;
let learnCallbacks: { onSuccess: (result: { data: unknown }) => void };

// The component runs two actions; the bound function keeps the action's name
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    action: (...args: unknown[]) => unknown,
    options: { onSuccess: (result: { data: unknown }) => void },
  ) => {
    if (action.name.includes("createGroup")) {
      return { execute: executeCreateGroup, isExecuting: isCreatingGroup };
    }
    learnCallbacks = options;
    return { execute: executeLearn, isExecuting: false };
  },
}));

vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate }),
}));

vi.mock("@/utils/actions/group", () => ({
  createGroupAction: function createGroupAction() {},
}));

vi.mock("@/utils/actions/learn-patterns", () => ({
  learnPatternsFromHistoryAction: function learnPatternsFromHistoryAction() {},
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock("@/components/Toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock(
  "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns",
  () => ({
    ViewLearnedPatterns: () => <div>patterns list</div>,
  }),
);

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => children,
  DialogTrigger: ({ children }: { children: ReactNode }) => children,
}));

import { LearnedPatternsDialog } from "./LearnedPatterns";

beforeEach(() => {
  vi.clearAllMocks();
  isCreatingGroup = false;
});

afterEach(() => {
  cleanup();
});

describe("LearnedPatternsDialog", () => {
  // Learning creates the rule's group server-side when it has none, which
  // races the dialog's own creation and can leave the dialog group-less
  it("won't learn while the group is still being created", () => {
    isCreatingGroup = true;

    render(<LearnedPatternsDialog ruleId="rule-1" groupId={null} />);

    const learn = screen.getByRole("button", { name: /learn from history/i });
    fireEvent.click(learn);

    expect(learn).toHaveProperty("disabled", true);
    expect(executeLearn).not.toHaveBeenCalled();
  });

  it("refreshes the open pattern list once senders are queued", () => {
    render(<LearnedPatternsDialog ruleId="rule-1" groupId="group-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: /learn from history/i }),
    );
    expect(executeLearn).toHaveBeenCalledWith({ ruleId: "rule-1" });

    act(() =>
      learnCallbacks.onSuccess({
        data: { candidates: 2, queued: 2, failed: 0 },
      }),
    );

    expect(mutate).toHaveBeenCalledWith("/api/user/group/group-1/items");
  });

  it("does not refresh when nothing qualified", () => {
    render(<LearnedPatternsDialog ruleId="rule-1" groupId="group-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: /learn from history/i }),
    );
    act(() =>
      learnCallbacks.onSuccess({
        data: { candidates: 0, queued: 0, failed: 0 },
      }),
    );

    expect(mutate).not.toHaveBeenCalled();
  });
});
