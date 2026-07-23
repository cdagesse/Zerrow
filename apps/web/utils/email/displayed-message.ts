type MessageLike = { labelIds?: string[] | null };

/**
 * Picks the message a thread row should display for a given folder view.
 *
 * In the Sent folder Gmail returns threads containing any sent message, so
 * the newest message is often the other person's reply. Show the user's own
 * last sent message there instead; the participant helper then shows the
 * recipient rather than the sender.
 */
export function getDisplayedMessage<T extends MessageLike>(
  thread: { messages?: T[] | null },
  folderType?: string,
): T | undefined {
  const messages = thread.messages || [];
  if (folderType === "sent") {
    const lastSent = [...messages]
      .reverse()
      .find((message) => message.labelIds?.includes("SENT"));
    if (lastSent) return lastSent;
  }
  return messages[messages.length - 1];
}
