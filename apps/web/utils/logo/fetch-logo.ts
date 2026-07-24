import { createSafeImageProxyFetch } from "@inboxzero/image-proxy/node-safe-fetch";

// Company logo lookup: a chain of providers tried in order until one
// returns a usable image. All requests go through the SSRF-guarded safe
// fetch (blocked-host policy + DNS resolution pinned to public addresses),
// because the domain comes from contact data.
const ATTEMPT_TIMEOUT_MS = 4000;
// Providers × 4s can exceed the route budget — stop starting new attempts
// past this point and return not-found instead of timing out the request
const TOTAL_BUDGET_MS = 12_000;
const MAX_REDIRECT_HOPS = 3;
// Anything smaller is a placeholder pixel or an empty "default" icon —
// fall through to the next provider
const MIN_IMAGE_BYTES = 600;

export type FetchedLogo = {
  body: ArrayBuffer;
  contentType: string;
};

// Hostname shape only — the safe fetch enforces the blocked-host policy
// and public-IP resolution on top
const DOMAIN_PATTERN =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function normalizeLogoDomain(input: string): string | null {
  const domain = input
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (domain.length > 253) return null;
  if (!DOMAIN_PATTERN.test(domain)) return null;
  // Real TLDs are alphabetic (or punycode) — rejects IPv4 literals
  const tld = domain.split(".").at(-1) ?? "";
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,})$/.test(tld)) return null;
  return domain;
}

export async function fetchLogo({
  domain,
  logoDevToken,
  fetchImpl = createSafeImageProxyFetch,
}: {
  domain: string;
  logoDevToken?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<FetchedLogo | null> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const url of providerUrls(domain, logoDevToken)) {
    if (Date.now() >= deadline) return null;
    const logo = await attemptFetch(url, fetchImpl);
    if (logo) return logo;
  }

  return null;
}

function providerUrls(domain: string, logoDevToken?: string): string[] {
  const encoded = encodeURIComponent(domain);
  return [
    ...(logoDevToken
      ? [
          `https://img.logo.dev/${encoded}?token=${encodeURIComponent(logoDevToken)}&size=128&format=png`,
        ]
      : []),
    `https://logo.clearbit.com/${encoded}`,
    `https://icons.duckduckgo.com/ip3/${encoded}.ico`,
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`,
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${encoded}&sz=128`,
  ];
}

async function attemptFetch(
  url: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<FetchedLogo | null> {
  try {
    const response = await fetchWithRedirects(url, fetchImpl);
    if (!response?.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const body = await response.arrayBuffer();
    if (body.byteLength < MIN_IMAGE_BYTES) return null;

    return { body, contentType };
  } catch {
    // Timeouts, DNS failures, TLS errors — just move down the chain
    return null;
  }
}

// The safe fetch never follows redirects itself; follow them manually so
// every hop goes back through host validation (a provider must not be able
// to 302 the request into a private address)
async function fetchWithRedirects(
  url: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<Response | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (new URL(current).protocol !== "https:") return null;

    const response = await fetchImpl(current, {
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      headers: { accept: "image/*" },
    });

    if (!isRedirect(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return null;
    current = new URL(location, current).toString();
  }

  return null;
}

function isRedirect(status: number) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}
