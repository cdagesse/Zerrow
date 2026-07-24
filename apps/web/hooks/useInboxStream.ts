"use client";

import { useEffect, useRef } from "react";

const MAX_RECONNECT_ATTEMPTS = 5;

// Listens for server-pushed "new mail" events so the inbox refreshes
// instantly. Best-effort: gives up after a few failed connections (SWR
// polling remains the fallback) and disconnects while the tab is hidden.
export function useInboxStream({
  emailAccountId,
  onNewMail,
}: {
  emailAccountId: string;
  onNewMail: () => void;
}) {
  const onNewMailRef = useRef(onNewMail);
  onNewMailRef.current = onNewMail;

  useEffect(() => {
    if (!emailAccountId) return;
    if (typeof EventSource === "undefined") return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stopped = false;

    const disconnect = () => {
      eventSource?.close();
      eventSource = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    const connect = () => {
      if (stopped || document.hidden || eventSource) return;

      eventSource = new EventSource(
        `/api/email-stream?emailAccountId=${encodeURIComponent(emailAccountId)}`,
        { withCredentials: true },
      );

      eventSource.addEventListener("inbox", () => {
        attempts = 0;
        onNewMailRef.current();
      });

      eventSource.onopen = () => {
        attempts = 0;
      };

      eventSource.onerror = () => {
        disconnect();
        if (stopped) return;

        attempts += 1;
        // Beyond the cap, stay quiet until the tab regains visibility
        if (attempts > MAX_RECONNECT_ATTEMPTS) return;

        reconnectTimer = setTimeout(
          connect,
          Math.min(30_000, 1000 * 2 ** attempts),
        );
      };
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        disconnect();
      } else {
        attempts = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    connect();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      disconnect();
    };
  }, [emailAccountId]);
}
