import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { type ContactActivity, mergeContactActivity } from "@/utils/contacts";

const querySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(["recent", "frequent"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;

export const GET = withEmailAccount("contacts", async (request) => {
  const { emailAccountId, email: userEmail } = request.auth;
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    search: searchParams.get("search") || undefined,
    sort: searchParams.get("sort") || undefined,
    limit: searchParams.get("limit") || undefined,
  });

  const result = await getContacts({ emailAccountId, userEmail, ...query });

  return NextResponse.json(result);
});

// People you've exchanged email with, aggregated from the EmailMessage cache
// (senders of received mail + recipients of sent mail), overlaid with any
// user-saved Contact details.
async function getContacts({
  emailAccountId,
  userEmail,
  search,
  sort,
  limit,
}: {
  emailAccountId: string;
  userEmail: string;
  search?: string;
  sort: "recent" | "frequent";
  limit: number;
}) {
  const searchTerm = search?.trim().toLowerCase();

  const activity = await queryContactActivity({
    emailAccountId,
    userEmail,
    searchTerm,
    sort,
    limit,
  });
  const hasMore = activity.length === limit;

  const saved = await prisma.contact.findMany({
    where: { emailAccountId },
    select: {
      email: true,
      name: true,
      title: true,
      phone: true,
      notes: true,
      aiSummary: true,
      photoUrl: true,
      useCompanyLogo: true,
      isPersonal: true,
      companyId: true,
    },
  });

  // Saved contacts whose activity fell outside the search/limit window would
  // otherwise show zeroed stats — fetch their aggregates directly
  const foundEmails = new Set(activity.map((entry) => entry.email));
  const missingEmails = saved
    .map((contact) => contact.email.toLowerCase())
    .filter((email) => !foundEmails.has(email));
  if (missingEmails.length) {
    activity.push(
      ...(await queryContactActivity({
        emailAccountId,
        userEmail,
        emails: missingEmails,
      })),
    );
  }

  const companies = await prisma.company.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      domains: true,
      logoUrl: true,
      label: {
        select: {
          id: true,
          name: true,
          parent: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const contacts = mergeContactActivity({ activity, saved }).filter(
    (contact) =>
      !searchTerm ||
      contact.email.includes(searchTerm) ||
      contact.name?.toLowerCase().includes(searchTerm) ||
      (contact.companyId &&
        companyNameById
          .get(contact.companyId)
          ?.toLowerCase()
          .includes(searchTerm)),
  );

  const syncState = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      googleContactsSyncEnabled: true,
      googleContactsSyncedAt: true,
      account: { select: { provider: true } },
    },
  });

  return {
    contacts,
    companies,
    hasMore,
    sync: {
      provider: syncState?.account.provider ?? null,
      googleEnabled: syncState?.googleContactsSyncEnabled ?? false,
      googleSyncedAt: syncState?.googleContactsSyncedAt ?? null,
    },
  };
}

async function queryContactActivity({
  emailAccountId,
  userEmail,
  searchTerm,
  sort = "recent",
  limit,
  emails,
}: {
  emailAccountId: string;
  userEmail: string;
  searchTerm?: string;
  sort?: "recent" | "frequent";
  limit?: number;
  emails?: string[];
}): Promise<ContactActivity[]> {
  const filterClause = emails?.length
    ? Prisma.sql`WHERE email IN (${Prisma.join(emails)})`
    : searchTerm
      ? Prisma.sql`WHERE (position(${searchTerm} in email) > 0 OR position(${searchTerm} in LOWER(COALESCE(name, ''))) > 0)`
      : Prisma.empty;
  const orderByClause =
    sort === "frequent"
      ? Prisma.sql`("receivedCount" + "sentCount") DESC`
      : Prisma.sql`"lastInteractionAt" DESC`;
  const limitClause = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<ContactActivity[]>`
    WITH combined AS (
      SELECT LOWER("from") AS email, NULLIF("fromName", '') AS name, 1 AS received, 0 AS sent, "date"
      FROM "EmailMessage"
      WHERE "emailAccountId" = ${emailAccountId} AND sent = false AND draft = false AND "from" <> ''
      UNION ALL
      SELECT LOWER("to") AS email, NULL AS name, 0 AS received, 1 AS sent, "date"
      FROM "EmailMessage"
      WHERE "emailAccountId" = ${emailAccountId} AND sent = true AND draft = false AND "to" <> '' AND "to" <> 'Missing'
    ),
    grouped AS (
      SELECT
        email,
        MAX(name) AS name,
        SUM(received)::int AS "receivedCount",
        SUM(sent)::int AS "sentCount",
        MAX("date") AS "lastInteractionAt"
      FROM combined
      WHERE email <> ${userEmail.toLowerCase()}
      GROUP BY email
    )
    SELECT * FROM grouped
    ${filterClause}
    ORDER BY ${orderByClause}
    ${limitClause}
  `;
}
