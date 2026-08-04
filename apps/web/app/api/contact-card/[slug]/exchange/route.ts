import { NextResponse } from "next/server";
import { contactCardExchangeBody } from "@/utils/actions/contact-card.validation";
import { submitContactCardExchange } from "@/utils/contact-card/exchange";
import { withError } from "@/utils/middleware";

// Public, unauthenticated: the Exchange tab on someone's card. The submission
// is stored for the card owner to review — it never becomes a contact here.
export const POST = withError(
  "contact-card-exchange",
  async (request, context) => {
    const { slug } = await context.params;
    // A body that isn't JSON is the caller's mistake: hand Zod null so the
    // middleware answers 400, rather than letting the parse error become a 500
    // and unhandled-error telemetry
    const submission = contactCardExchangeBody.parse(
      await request.json().catch(() => null),
    );

    const result = await submitContactCardExchange({
      slug,
      submission,
      headers: request.headers,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
