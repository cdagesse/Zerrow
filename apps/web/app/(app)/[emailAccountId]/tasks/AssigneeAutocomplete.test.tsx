/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const onChange = vi.fn();
const onPick = vi.fn();

vi.mock("swr", () => ({
  default: () => ({
    data: {
      contacts: [
        { email: "ada@analytical.com", name: "Ada Lovelace" },
        { email: "grace@navy.mil", name: "Grace Hopper" },
      ],
    },
  }),
}));

vi.mock("@/components/email-list/SenderAvatar", () => ({
  SenderAvatar: () => null,
}));

import { AssigneeAutocomplete } from "./AssigneeAutocomplete";

function renderPicker() {
  return render(
    <AssigneeAutocomplete value="" onChange={onChange} onPick={onPick} />,
  );
}

function openList() {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("AssigneeAutocomplete", () => {
  // Enter/Space on a focused option dispatches a click, so selection has to
  // live there — a mousedown-only handler locks keyboard users out
  it("selects the option a click activates", () => {
    renderPicker();
    openList();

    fireEvent.click(screen.getByRole("option", { name: /Ada Lovelace/ }));

    expect(onChange).toHaveBeenCalledWith("ada@analytical.com");
    expect(onPick).toHaveBeenCalledWith("ada@analytical.com");
  });

  it("closes after picking from the keyboard", () => {
    renderPicker();
    const input = openList();
    fireEvent.keyDown(input, { key: "ArrowDown" });

    fireEvent.click(document.activeElement as Element);

    expect(onPick).toHaveBeenCalledWith("ada@analytical.com");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("stays open while focus moves from the input into an option", () => {
    renderPicker();
    const input = openList();
    const option = screen.getByRole("option", { name: /Grace Hopper/ });

    fireEvent.focusOut(input, { relatedTarget: option });

    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("closes when focus leaves the picker entirely", () => {
    renderPicker();
    const input = openList();

    fireEvent.focusOut(input, { relatedTarget: null });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape without picking anything", () => {
    renderPicker();
    const input = openList();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("moves focus into the list with ArrowDown", () => {
    renderPicker();
    const input = openList();

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: /Ada Lovelace/ }),
    );
  });
});
