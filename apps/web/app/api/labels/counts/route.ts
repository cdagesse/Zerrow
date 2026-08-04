import chunk from "lodash/chunk";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";

export const maxDuration = 15;

// How many labels to look up at once: matches the fan-out the old hard cap
// allowed, so peak provider concurrency is unchanged
const UNREAD_COUNT_BATCH_SIZE = 30;

export type LabelCountsResponse = { counts: Record<string, number> };

// Sidebar badge counts: unread threads for the inbox and each user label.
export const GET = withEmailProvider("labels/counts", async (request) => {
  const { emailProvider } = request;

  if (!emailProvider.getUnreadCounts) {
    return NextResponse.json({ counts: {} } satisfies LabelCountsResponse);
  }

  const labels = await emailProvider.getLabels({ includeHidden: true });
  const labelIds = ["INBOX", ...labels.map((label) => label.id)];

  // Each id costs one provider call and getUnreadCounts fans a batch out in
  // parallel, so ask in chunks. Truncating the list instead left the sidebar
  // rendering labels that could never get a badge.
  const counts: Record<string, number> = {};
  for (const batch of chunk(labelIds, UNREAD_COUNT_BATCH_SIZE)) {
    Object.assign(counts, await emailProvider.getUnreadCounts(batch));
  }

  return NextResponse.json({ counts } satisfies LabelCountsResponse);
});
