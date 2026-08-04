/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readImageAsDownscaledDataUrl } from "./business-card-image";

const decodeFailure = new Error("The source image could not be decoded");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readImageAsDownscaledDataUrl", () => {
  it("blames HEIC when the browser can't decode it", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(decodeFailure),
    );

    await expect(
      readImageAsDownscaledDataUrl(
        new File(["x"], "card.heic", { type: "image/heic" }),
      ),
    ).rejects.toThrow(/HEIC/);
  });

  it("recognises HEIC by extension when the browser reports no type", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(decodeFailure),
    );

    await expect(
      readImageAsDownscaledDataUrl(new File(["x"], "CARD.HEIF", { type: "" })),
    ).rejects.toThrow(/HEIC/);
  });

  it("passes other decode failures through unchanged", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(decodeFailure),
    );

    await expect(
      readImageAsDownscaledDataUrl(
        new File(["x"], "card.png", { type: "image/png" }),
      ),
    ).rejects.toBe(decodeFailure);
  });
});
