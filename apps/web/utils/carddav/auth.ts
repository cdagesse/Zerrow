import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import prisma from "@/utils/prisma";

// CardDAV clients authenticate with HTTP Basic: the account email plus a
// generated app password (stored hashed).

export function generateCarddavPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function hashCarddavPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function authenticateCarddavRequest(
  authorizationHeader: string | null,
): Promise<{ emailAccountId: string; email: string } | null> {
  if (!authorizationHeader?.startsWith("Basic ")) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(authorizationHeader.slice(6), "base64").toString(
      "utf-8",
    );
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  const email = decoded.slice(0, separator).trim().toLowerCase();
  const password = decoded.slice(separator + 1);
  if (!email || !password) return null;

  const account = await prisma.emailAccount.findFirst({
    where: { email, carddavPasswordHash: { not: null } },
    select: { id: true, email: true, carddavPasswordHash: true },
  });
  if (!account?.carddavPasswordHash) return null;

  const expected = Buffer.from(account.carddavPasswordHash, "hex");
  const actual = createHash("sha256").update(password).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  return { emailAccountId: account.id, email: account.email };
}

export function unauthorizedResponse(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zerrow Contacts"' },
  });
}
