/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactPeekContext } from "@/components/email-list/contact-peek-context";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import type { ThreadMessage } from "@/components/email-list/types";

function renderDetails(
  headers: Record<string, string>,
  openContactPeek: (email: string) => void,
) {
  const message = {
    date: "2024-01-01T00:00:00.000Z",
    headers,
  } as unknown as ThreadMessage;

  return render(
    <ContactPeekContext.Provider value={openContactPeek}>
      <EmailDetails message={message} />
    </ContactPeekContext.Provider>,
  );
}

describe("EmailDetails", () => {
  afterEach(cleanup);

  it("opens the contact card with the extracted address", () => {
    const openContactPeek = vi.fn();
    renderDetails(
      { from: "Jane Doe <jane@example.com>", date: "2024-01-01" },
      openContactPeek,
    );

    screen.getByRole("button", { name: "Jane Doe <jane@example.com>" }).click();

    expect(openContactPeek).toHaveBeenCalledWith("jane@example.com");
  });

  // A contact card keyed on something that isn't an address can only ever be
  // empty, so these tokens must not be clickable
  it("renders header tokens with no address as plain text", () => {
    const openContactPeek = vi.fn();
    const { container } = renderDetails(
      {
        to: "undisclosed-recipients:;, Jane Doe <jane@example.com>",
        date: "2024-01-01",
      },
      openContactPeek,
    );

    expect(container.textContent).toContain("undisclosed-recipients:;");
    expect(
      screen.queryByRole("button", { name: /undisclosed-recipients/ }),
    ).toBe(null);
    expect(
      screen.getByRole("button", { name: "Jane Doe <jane@example.com>" }),
    ).toBeTruthy();
  });
});
