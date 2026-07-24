import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { isPublicEmailDomain } from "@/utils/email";
import { type DomainStat, isLikelyAutomatedSender } from "@/utils/contacts";
import { queryContactActivity } from "@/utils/contacts-activity";

export type ContactDomainsResponse = Awaited<ReturnType<typeof getDomainStats>>;

// Per-domain people/email aggregates over the FULL mail history (the main
// contacts list is windowed). Powers the Suggested view and company stats.
export const GET = withEmailAccount("contacts", async (request) => {
  const { emailAccountId, email: userEmail } = request.auth;
  const result = await getDomainStats({ emailAccountId, userEmail });
  return NextResponse.json(result);
});

async function getDomainStats({
  emailAccountId,
  userEmail,
}: {
  emailAccountId: string;
  userEmail: string;
}) {
  const activity = await queryContactActivity({ emailAccountId, userEmail });

  const byDomain = new Map<string, DomainStat>();
  for (const entry of activity) {
    // Suggestions are about real people — skip machine mailboxes entirely
    if (isLikelyAutomatedSender(entry.email)) continue;

    const domain = (entry.email.split("@")[1] ?? "").replace(/^www\./, "");
    if (!domain || isPublicEmailDomain(domain)) continue;

    const stat = byDomain.get(domain) ?? {
      domain,
      people: 0,
      emails: 0,
      received: 0,
      sent: 0,
      lastInteractionAt: null,
    };
    stat.people += 1;
    stat.emails += entry.receivedCount + entry.sentCount;
    stat.received += entry.receivedCount;
    stat.sent += entry.sentCount;
    if (
      !stat.lastInteractionAt ||
      new Date(entry.lastInteractionAt) > new Date(stat.lastInteractionAt)
    ) {
      stat.lastInteractionAt = entry.lastInteractionAt;
    }
    byDomain.set(domain, stat);
  }

  const domains = [...byDomain.values()].sort((a, b) => b.emails - a.emails);

  return { domains };
}
