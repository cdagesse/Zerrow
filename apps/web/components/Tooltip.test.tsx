/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

function renderTooltip() {
  render(
    <Tooltip content="Explains the button">
      <button type="button">Trigger</button>
    </Tooltip>,
  );
  return screen.getByRole("button", { name: "Trigger" });
}

function clickWith(element: Element, pointerType: string) {
  fireEvent(
    element,
    new PointerEvent("click", { bubbles: true, cancelable: true, pointerType }),
  );
}

afterEach(() => {
  cleanup();
});

describe("Tooltip", () => {
  // A hybrid laptop reports a hover-capable pointer for its mouse, so the
  // device-wide media query sent taps down the mouse branch
  it("toggles on a touch tap", () => {
    const trigger = renderTooltip();

    clickWith(trigger, "touch");

    expect(screen.getAllByText("Explains the button").length).toBeGreaterThan(
      0,
    );

    clickWith(trigger, "touch");

    expect(screen.queryByText("Explains the button")).toBeNull();
  });

  it("does not open on a mouse click", () => {
    const trigger = renderTooltip();

    clickWith(trigger, "mouse");

    expect(screen.queryByText("Explains the button")).toBeNull();
  });
});
