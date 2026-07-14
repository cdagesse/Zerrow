"use client";

import { type ComponentProps, useEffect, useState } from "react";
import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = ComponentProps<typeof SonnerToaster>;

/**
 * Sonner's built-in `theme="system"` tracks the OS preference, but our theme
 * is class-based (next-themes sets `dark` on <html>), so observe that instead.
 */
export function ThemedToaster(props: Omit<ToasterProps, "theme">) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const el = document.documentElement;
    const update = () =>
      setTheme(el.classList.contains("dark") ? "dark" : "light");
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <SonnerToaster theme={theme} {...props} />;
}
