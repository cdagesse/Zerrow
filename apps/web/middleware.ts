import { type NextRequest, NextResponse } from "next/server";

// CardDAV clients (iOS/macOS Contacts) speak WebDAV verbs that Next.js
// route handlers can't receive. This middleware — scoped strictly to
// CardDAV paths — tunnels PROPFIND/REPORT to the route as POST with the
// real verb in x-webdav-method, and serves the .well-known redirect.
export const config = {
  matcher: ["/.well-known/carddav", "/api/carddav/:path*", "/api/carddav"],
};

const TUNNELED_METHODS = new Set(["PROPFIND", "REPORT"]);

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/.well-known/carddav") {
    return NextResponse.redirect(new URL("/api/carddav", request.url), 301);
  }

  if (!TUNNELED_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const headers = new Headers();
  headers.set("x-webdav-method", request.method);
  for (const name of ["authorization", "content-type", "depth"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(new URL(request.nextUrl.pathname, request.url), {
    method: "POST",
    headers,
    body: await request.text(),
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
