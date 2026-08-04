/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const mutateContacts = vi.fn();

type ResolveInput = { exchangeId: string; accept: boolean };
type Callbacks = {
  onSuccess: (args: { input: ResolveInput }) => void;
  onError: (args: { error: unknown; input: ResolveInput }) => void;
};
let callbacks: Callbacks;

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: Callbacks) => {
    callbacks = options;
    return { execute, isExecuting: false };
  },
}));

vi.mock("@/components/Toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock("@/utils/actions/contact-card", () => ({
  resolveContactCardExchangeAction: vi.fn(),
}));

import { ExchangeSuggestions } from "./ExchangeSuggestions";

const entry = {
  id: "exchange-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  name: "Ada Lovelace",
  email: "ada@analytical.com",
  phone: null,
  companyTitle: null,
  note: null,
};

function renderSuggestions() {
  return render(
    <ExchangeSuggestions pending={[entry]} mutateContacts={mutateContacts} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ExchangeSuggestions", () => {
  it("keeps quiet until the server confirms the add", () => {
    renderSuggestions();

    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    expect(execute).toHaveBeenCalledWith({
      exchangeId: entry.id,
      accept: true,
    });
    expect(toastSuccess).not.toHaveBeenCalled();

    act(() =>
      callbacks.onSuccess({ input: { exchangeId: entry.id, accept: true } }),
    );

    expect(toastSuccess).toHaveBeenCalledWith({
      description: "Ada Lovelace added",
    });
    expect(mutateContacts).toHaveBeenCalled();
  });

  it("brings the row back when the add fails, so it can be retried", () => {
    renderSuggestions();

    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.queryByText(entry.name)).toBeNull();

    act(() =>
      callbacks.onError({
        error: { serverError: "nope" },
        input: { exchangeId: entry.id, accept: true },
      }),
    );

    expect(toastError).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText(entry.name)).toBeTruthy();
  });

  it("brings the row back when the dismiss fails", () => {
    renderSuggestions();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(entry.name)).toBeNull();

    act(() =>
      callbacks.onError({
        error: { serverError: "nope" },
        input: { exchangeId: entry.id, accept: false },
      }),
    );

    expect(screen.getByText(entry.name)).toBeTruthy();
  });
});
