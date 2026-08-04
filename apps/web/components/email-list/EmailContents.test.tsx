/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.example.com/proxy",
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE: true,
  },
}));

import { HtmlEmail, PlainEmail } from "./EmailContents";

(globalThis as { React?: typeof React }).React = React;

describe("HtmlEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ html: "<p>proxied</p>" }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requests fresh rewritten html after remounting the same email", async () => {
    const html = "<p>Hello</p>";

    const firstRender = render(<HtmlEmail html={html} />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    firstRender.unmount();

    render(<HtmlEmail html={html} />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps https images allowed when proxy rewriting leaves the html unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          html: '<img src="https://cdn.example.com/photo.png" />',
        }),
      }),
    );

    const { getByTitle } = render(
      <HtmlEmail html={'<img src="https://cdn.example.com/photo.png" />'} />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const iframe = getByTitle("Email content preview");
    expect(iframe.getAttribute("srcdoc")).toContain("img-src data: https:;");
  });

  it("locks image loading to the proxy origin after rewriting succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          html: '<img src="https://app.example.com/api/image-proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png&amp;e=1&amp;s=test" />',
        }),
      }),
    );

    const { getByTitle } = render(
      <HtmlEmail html={'<img src="https://cdn.example.com/photo.png" />'} />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const iframe = getByTitle("Email content preview");
    await waitFor(() => {
      expect(iframe.getAttribute("srcdoc")).toContain(
        "img-src data: https://app.example.com;",
      );
    });
  });
});

describe("HtmlEmail iframe height", () => {
  const html = "<p>Hello</p>";
  let resizeCallbacks: ResizeObserverCallback[] = [];

  beforeEach(() => {
    resizeCallbacks = [];
    // Returning the html unchanged keeps srcDoc stable, so the frame is not
    // reloaded (and its document replaced) mid-test
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html }) }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not grow on every resize delivery, and shrinks with its content", async () => {
    let contentHeight = 500;

    const { getByTitle } = render(<HtmlEmail html={html} />);
    await waitFor(() => {
      expect(resizeCallbacks.length).toBeGreaterThan(0);
    });

    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    stubIframeMetrics(iframe, () => contentHeight);

    deliverResize(resizeCallbacks);
    expect(iframe.style.height).toBe("503px");

    deliverResize(resizeCallbacks);
    deliverResize(resizeCallbacks);
    expect(iframe.style.height).toBe("503px");

    // Quoted text hidden again: the frame has to come back down
    contentHeight = 120;
    deliverResize(resizeCallbacks);
    expect(iframe.style.height).toBe("123px");
  });
});

describe("PlainEmail", () => {
  afterEach(() => {
    cleanup();
  });

  it("decodes html entities in plain text email content", () => {
    const text =
      "Hi, I was curious to know-do you have a preference for puzzle games or more action-oriented ones? I&#39;ve found that mobile gaming is such a fascinating way to pass the time, and I&#39;m always";

    const { container } = render(<PlainEmail text={text} />);

    expect(container.textContent).toContain("I've found");
    expect(container.textContent).not.toContain("&#39;");
  });
});

function deliverResize(callbacks: ResizeObserverCallback[]) {
  act(() => {
    for (const callback of callbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

// jsdom has no layout, so the frame's document has to be given heights. The
// root element's scrollHeight reproduces the browser rule that makes a feedback
// loop possible: it is floored at the frame's viewport, which is the height the
// component itself set.
function stubIframeMetrics(
  iframe: HTMLIFrameElement,
  getContentHeight: () => number,
) {
  const iframeDocument = iframe.contentWindow?.document;
  if (!iframeDocument) throw new Error("iframe document unavailable");

  const getViewportHeight = () =>
    Number.parseFloat(iframe.style.height || "0") || 0;

  defineHeight(iframeDocument.documentElement, "scrollHeight", () =>
    Math.max(getContentHeight(), getViewportHeight()),
  );
  defineHeight(
    iframeDocument.documentElement,
    "offsetHeight",
    getContentHeight,
  );
  defineHeight(iframeDocument.body, "scrollHeight", getContentHeight);
  defineHeight(iframeDocument.body, "offsetHeight", getContentHeight);
}

function defineHeight(
  element: Element,
  property: "scrollHeight" | "offsetHeight",
  get: () => number,
) {
  Object.defineProperty(element, property, { configurable: true, get });
}
