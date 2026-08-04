import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import {
  CARD_CLICK_KINDS,
  recordContactCardClick,
} from "@/utils/contact-card/views";
import {
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/utils/rate-limit";

const clickBody = z.object({ kind: z.enum(CARD_CLICK_KINDS) });

// Public: engagement beacons from the card page (phone/email/social taps).
// Fire-and-forget on the client — the response body is never read.
export const POST = withError(
  "contact-card-click",
  async (request, context) => {
    const { slug } = await context.params;

    // Taps are stored one row per tap with no dedupe, so without a limit a
    // scripted caller can both inflate the owner's engagement numbers and grow
    // the table without bound. Same shape as the view beacon: per card per
    // visitor, so one noisy visitor can't stop other cards being counted.
    const limited = await checkRateLimit({
      rule: {
        key: createRateLimitKey([
          "contact-card-click",
          slug,
          getClientIp(request.headers),
        ]),
        limit: 60,
        windowSeconds: 60,
      },
      logger: request.logger,
    });
    if (limited.limited) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const parsed = clickBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }

    await recordContactCardClick({
      slug,
      kind: parsed.data.kind,
      headers: request.headers,
      logger: request.logger,
    });

    return NextResponse.json({ ok: true });
  },
);
