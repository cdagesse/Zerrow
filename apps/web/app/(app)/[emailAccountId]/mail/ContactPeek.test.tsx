/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContactPeek } from "@/components/email-list/contact-peek-context";

const IGNORED_EMAIL = "recruiter@spam.com";

let ignoredEmails: string[] = [];

vi.mock("swr", () => ({
  default: () => ({
    data: { contacts: [], companies: [], ignoredEmails },
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  }),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock("@/components/LoadingContent", () => ({
  LoadingContent: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? children : null,
  SheetContent: ({ children }: { children: ReactNode }) => children,
  SheetTitle: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/app/(app)/[emailAccountId]/contacts/ContactDetailSheet", () => ({
  ContactDetails: ({ contact }: { contact: { email: string } }) => (
    <div>editable card for {contact.email}</div>
  ),
}));

import { ContactPeekProvider } from "./ContactPeek";

function Opener({ email }: { email: string }) {
  const setEmail = useContactPeek();
  return (
    <button type="button" onClick={() => setEmail?.(email)}>
      open
    </button>
  );
}

function openPeek(email: string) {
  render(
    <ContactPeekProvider>
      <Opener email={email} />
    </ContactPeekProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "open" }));
}

beforeEach(() => {
  ignoredEmails = [];
});

afterEach(() => {
  cleanup();
});

describe("ContactPeekProvider", () => {
  // "Ignore this contact" only suppresses the address from the API's list, so
  // an unguarded empty-contact fallback offers to save it straight back
  it("does not offer a card for an ignored sender", () => {
    ignoredEmails = [IGNORED_EMAIL];

    openPeek(IGNORED_EMAIL);

    expect(screen.queryByText(/editable card/)).toBeNull();
    expect(screen.getByText(new RegExp(IGNORED_EMAIL))).toBeTruthy();
  });

  it("still opens a blank card for an unknown sender", () => {
    openPeek("new@person.com");

    expect(screen.getByText(/editable card for new@person.com/)).toBeTruthy();
  });
});
