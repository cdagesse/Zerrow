import { NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { fetchLogo, normalizeLogoDomain } from "@/utils/logo/fetch-logo";

export const runtime = "nodejs";
export const maxDuration = 15;

// Public logo proxy: the browser never talks to the logo providers
// directly, and the provider chain runs behind SSRF guards because the
// domain comes from contact data (see utils/logo/fetch-logo.ts)
export const GET = withError("logo", async (request) => {
  const raw = request.nextUrl.searchParams.get("domain") ?? "";
  const domain = normalizeLogoDomain(raw);
  if (!domain) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const logo = await fetchLogo({
    domain,
    logoDevToken: env.LOGO_DEV_TOKEN,
  });

  if (!logo) {
    return NextResponse.json(
      { error: "No logo found" },
      // Cache misses briefly so a flaky provider can recover, without
      // hammering the chain on every avatar render
      { status: 404, headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }

  return new NextResponse(logo.body, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control":
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
