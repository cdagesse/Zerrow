/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardSky } from "./card-styles";

afterEach(cleanup);

describe("CardSky", () => {
  // The drifting layers are the containing block for the stars (they carry a
  // transform), so they have to fill the sky. Left in normal flow they collapse
  // around their absolute children and every percentage `top` resolves to 0.
  it("gives each drifting star layer the sky's full box", () => {
    const { container } = render(<CardSky />);

    const layers = [...container.querySelectorAll<HTMLElement>("div")].filter(
      (element) => element.style.animation.includes("drift"),
    );

    expect(layers).toHaveLength(2);
    for (const layer of layers) {
      expect(layer.style.position).toBe("absolute");
      expect(layer.style.inset).toBe("0");
      expect(layer.childElementCount).toBeGreaterThan(0);
    }
  });

  it("spreads stars down the sky rather than stacking them at the top", () => {
    const { container } = render(<CardSky />);

    const tops = [...container.querySelectorAll<HTMLElement>("div")]
      .filter((element) => element.style.borderRadius === "50%")
      .map((star) => star.style.top);

    expect(tops.length).toBeGreaterThan(0);
    expect(new Set(tops).size).toBeGreaterThan(1);
    expect(tops.every((top) => top.endsWith("%"))).toBe(true);
  });
});
