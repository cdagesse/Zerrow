/**
 * Backfills Contact.companyId from the contact's email domain.
 *
 * The contacts UI groups people by domain and attaches a Company only if one
 * happens to match, so a contact can look filed under a company on the website
 * while its companyId is null. CardDAV cannot do that inference — group
 * membership walks CompanyLabel -> companies -> contacts through the stored FK
 * — so those contacts are invisible to iOS groups.
 *
 * Uses companyOwningDomain, the same matcher the UI renders with, so what the
 * phone receives matches what the website shows rather than drifting from it.
 *
 * Dry run by default:
 *   pnpm tsx scripts/backfill-contact-company.ts
 *   pnpm tsx scripts/backfill-contact-company.ts --apply
 *   pnpm tsx scripts/backfill-contact-company.ts --apply --account=<emailAccountId>
 */
import prisma from "@/utils/prisma";
import { companyOwningDomain, emailDomain } from "@/utils/contacts";

const APPLY = process.argv.includes("--apply");
const ACCOUNT = process.argv
  .find((arg) => arg.startsWith("--account="))
  ?.split("=")[1];

async function main() {
  const where = {
    ...(ACCOUNT ? { emailAccountId: ACCOUNT } : {}),
    companyId: null,
    // Explicit assignment wins and personal contacts never group by company —
    // matching resolveContactCompany so the backfill cannot contradict the UI.
    isPersonal: false,
  };

  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: { id: true, email: true, emailAccountId: true },
    }),
    prisma.company.findMany({
      where: ACCOUNT ? { emailAccountId: ACCOUNT } : {},
      select: { id: true, name: true, domains: true, emailAccountId: true },
    }),
  ]);

  // Companies are per-account; matching across accounts would leak one
  // customer's company onto another's contact.
  const companiesByAccount = new Map<string, typeof companies>();
  for (const company of companies) {
    const list = companiesByAccount.get(company.emailAccountId) ?? [];
    list.push(company);
    companiesByAccount.set(company.emailAccountId, list);
  }

  const planned: { id: string; companyId: string }[] = [];
  const byCompany = new Map<string, number>();
  let noDomain = 0;
  let noMatch = 0;

  for (const contact of contacts) {
    const domain = contact.email ? emailDomain(contact.email) : "";
    if (!domain) {
      noDomain++;
      continue;
    }
    const match = companyOwningDomain(
      domain,
      companiesByAccount.get(contact.emailAccountId) ?? [],
    );
    if (!match) {
      noMatch++;
      continue;
    }
    planned.push({ id: contact.id, companyId: match.id });
    byCompany.set(match.name, (byCompany.get(match.name) ?? 0) + 1);
  }

  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"}${ACCOUNT ? ` (account ${ACCOUNT})` : " (all accounts)"}`,
  );
  console.log(`  unlinked, non-personal contacts : ${contacts.length}`);
  console.log(`  companies                       : ${companies.length}`);
  console.log(`  would link                      : ${planned.length}`);
  console.log(`  no usable domain                : ${noDomain}`);
  console.log(`  no company owns the domain      : ${noMatch}`);

  const top = [...byCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length) {
    console.log("\n  top companies by contacts gained:");
    for (const [name, count] of top) {
      console.log(`    ${String(count).padStart(4)}  ${name}`);
    }
  }

  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply to write these links.");
    return;
  }

  // Grouped so each company is one statement rather than one per contact.
  const idsByCompany = new Map<string, string[]>();
  for (const row of planned) {
    const ids = idsByCompany.get(row.companyId) ?? [];
    ids.push(row.id);
    idsByCompany.set(row.companyId, ids);
  }

  let updated = 0;
  for (const [companyId, ids] of idsByCompany) {
    const result = await prisma.contact.updateMany({
      // Re-assert companyId: null so a contact assigned by someone else while
      // this runs is left alone rather than overwritten.
      where: { id: { in: ids }, companyId: null },
      data: { companyId },
    });
    updated += result.count;
  }

  console.log(`\nLinked ${updated} contacts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
