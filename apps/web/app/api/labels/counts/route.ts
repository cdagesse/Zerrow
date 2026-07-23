import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";

export const maxDuration = 15;

export type LabelCountsResponse = { counts: Record<string, number> };

// Sidebar badge counts: unread threads for the inbox and each user label.
export const GET = withEmailProvider("labels/counts", async (request) => {
  const { emailProvider } = request;

  if (!emailProvider.getUnreadCounts) {
    return NextResponse.json({ counts: {} } satisfies LabelCountsResponse);
  }

  const labels = await emailProvider.getLabels({ includeHidden: true });
  // Cap the per-label lookups; each id costs one provider call
  const labelIds = ["INBOX", ...labels.map((label) => label.id)].slice(0, 30);
  const counts = await emailProvider.getUnreadCounts(labelIds);

  return NextResponse.json({ counts } satisfies LabelCountsResponse);
});
