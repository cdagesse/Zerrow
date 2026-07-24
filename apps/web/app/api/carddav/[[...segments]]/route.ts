import { withError } from "@/utils/middleware";
import {
  authenticateCarddavRequest,
  unauthorizedResponse,
} from "@/utils/carddav/auth";
import { handleCarddavRequest } from "@/utils/carddav/handler";

export const maxDuration = 60;

// CardDAV endpoint for iOS/macOS Contacts. Route handlers can't receive
// WebDAV verbs (PROPFIND/REPORT), so middleware tunnels those here as POST
// with the real verb in x-webdav-method; GET/PUT/DELETE/OPTIONS arrive
// natively.
const handle = withError("carddav", async (request, context) => {
  const method =
    request.method === "POST"
      ? (request.headers.get("x-webdav-method")?.toUpperCase() ?? "POST")
      : request.method;

  // OPTIONS responds before auth: iOS probes capabilities first
  if (method === "OPTIONS") {
    return toResponse(
      await handleCarddavRequest({
        method,
        segments: [],
        depth: "0",
        body: "",
        emailAccountId: "",
      }),
    );
  }

  const auth = await authenticateCarddavRequest(
    request.headers.get("authorization"),
  );
  if (!auth) return unauthorizedResponse();

  const params = (await context.params) as { segments?: string[] };

  const result = await handleCarddavRequest({
    method,
    segments: params.segments ?? [],
    depth: request.headers.get("depth") ?? "0",
    body: await request.text(),
    emailAccountId: auth.emailAccountId,
  });

  return toResponse(result);
});

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;

function toResponse(result: {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}): Response {
  return new Response(result.body ?? null, {
    status: result.status,
    headers: result.headers,
  });
}
