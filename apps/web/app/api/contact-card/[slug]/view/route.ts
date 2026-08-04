import { NextResponse } from "next/server";
import { recordContactCardView } from "@/utils/contact-card/views";
import { withError } from "@/utils/middleware";
import {
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/utils/rate-limit";

// Public, unauthenticated: the card page pings this once after it renders.
// Counting here rather than during render keeps Next's prefetching and
// metadata generation from inflating the number.
export const POST = withError("contact-card-view", async (request, context) => {
  const { slug } = await context.params;

  const limited = await checkRateLimit({
    rule: {
      // Scoped per card, not per visitor alone: one bucket for every card
      // means a shared-NAT office — or 60 pings at slugs that don't exist —
      // silently stops counting real views of unrelated cards. A caller
      // walking many slugs does get more requests in total this way, but each
      // one is a single indexed lookup and its writes are still capped per
      // card per day by the view dedupe, so undercounting is the worse trade.
      key: createRateLimitKey([
        "contact-card-view",
        slug,
        getClientIp(request.headers),
      ]),
      limit: 60,
      windowSeconds: 60,
    },
    logger: request.logger,
  });
  if (limited.limited) {
    return NextResponse.json({ counted: false }, { status: 429 });
  }

  const result = await recordContactCardView({
    slug,
    headers: request.headers,
    logger: request.logger,
  });

  return NextResponse.json(result);
});
