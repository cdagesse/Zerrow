import { redis } from "@/utils/redis";

// Live-inbox pub/sub: the Gmail webhook publishes here after processing new
// inbox mail; /api/email-stream relays it to open mail pages as an SSE event.

export function liveInboxChannel(emailAccountId: string) {
  return `inbox:${emailAccountId}`;
}

export async function publishNewInboxEmail({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  await redis.publish(
    liveInboxChannel(emailAccountId),
    JSON.stringify({ type: "new-mail" }),
  );
}
