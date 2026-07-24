"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { describeError, SafeError } from "@/utils/error";
import {
  createCompanyBody,
  enrichContactBody,
  updateCompanyBody,
  updateContactBody,
} from "@/utils/actions/contact.validation";
import { isPublicEmailDomain } from "@/utils/email";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiEnrichContact } from "@/utils/ai/contacts/enrich-contact";
import prisma from "@/utils/prisma";

export const updateContactAction = actionClient
  .metadata({ name: "updateContact" })
  .inputSchema(updateContactBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        email,
        name,
        title,
        phone,
        notes,
        photoUrl,
        useCompanyLogo,
        isPersonal,
        companyName,
      },
    }) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Only touch fields the caller sent, so partial updates can't wipe
      // previously saved details
      const details = {
        ...(name !== undefined && { name: name?.trim() || null }),
        ...(title !== undefined && { title: title?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(photoUrl !== undefined && { photoUrl: photoUrl?.trim() || null }),
        ...(useCompanyLogo !== undefined && { useCompanyLogo }),
        ...(isPersonal !== undefined && { isPersonal }),
        ...(companyName !== undefined && {
          companyId: await resolveCompanyId({
            emailAccountId,
            companyName,
            contactEmail: normalizedEmail,
          }),
        }),
      };

      const contact = await prisma.contact.upsert({
        where: {
          emailAccountId_email: { emailAccountId, email: normalizedEmail },
        },
        update: details,
        create: { emailAccountId, email: normalizedEmail, ...details },
      });

      return { contact };
    },
  );

// Reads the contact's recent emails and returns suggested details (name,
// title, company, phones) for the user to review; only the AI relationship
// summary is saved directly.
export const enrichContactAction = actionClient
  .metadata({ name: "enrichContact" })
  .inputSchema(enrichContactBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { email },
    }) => {
      const normalizedEmail = email.trim().toLowerCase();

      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const { messages } = await emailProvider.getMessagesFromSender({
        senderEmail: normalizedEmail,
        maxResults: 10,
      });

      if (!messages.length) {
        throw new SafeError(
          "No emails from this contact to learn from yet. Details can only be extracted from their emails.",
        );
      }

      const contact = await prisma.contact.findUnique({
        where: {
          emailAccountId_email: { emailAccountId, email: normalizedEmail },
        },
        select: { name: true },
      });

      try {
        const result = await aiEnrichContact({
          emailAccount,
          contactEmail: normalizedEmail,
          contactName: contact?.name,
          emails: messages.map((message) =>
            getEmailForLLM(message, { removeForwarded: true, maxLength: 2000 }),
          ),
        });
        if (!result) throw new SafeError("Could not analyze this contact");

        // The summary is the AI's own output — save it; extracted details
        // are suggestions the user applies explicitly
        await prisma.contact.upsert({
          where: {
            emailAccountId_email: { emailAccountId, email: normalizedEmail },
          },
          update: { aiSummary: result.summary },
          create: {
            emailAccountId,
            email: normalizedEmail,
            aiSummary: result.summary,
          },
        });

        return {
          suggestions: {
            name: result.name,
            title: result.title,
            company: result.company,
            phones: result.phones,
          },
          summary: result.summary,
        };
      } catch (error) {
        if (error instanceof SafeError) throw error;
        logger.error("Error enriching contact", { error });
        throw new SafeError(
          `Could not analyze this contact's emails: ${describeError(error)}`,
        );
      }
    },
  );

// Materializes an auto domain group (or creates a fresh company); merging
// domains keeps re-saving idempotent
export const createCompanyAction = actionClient
  .metadata({ name: "createCompany" })
  .inputSchema(createCompanyBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { name, domains } }) => {
      const trimmedName = name.trim();
      const normalized = normalizeDomains(domains ?? []);

      const existing = await prisma.company.findUnique({
        where: { emailAccountId_name: { emailAccountId, name: trimmedName } },
      });

      const company = existing
        ? await prisma.company.update({
            where: { id: existing.id },
            data: {
              domains: [...new Set([...existing.domains, ...normalized])],
            },
          })
        : await prisma.company.create({
            data: { emailAccountId, name: trimmedName, domains: normalized },
          });

      return { company };
    },
  );

export const updateCompanyAction = actionClient
  .metadata({ name: "updateCompany" })
  .inputSchema(updateCompanyBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { id, name, domains, logoUrl, labelName, labelParentName },
    }) => {
      const existing = await prisma.company.findFirst({
        where: { id, emailAccountId },
      });
      if (!existing) throw new SafeError("Company not found");

      const company = await prisma.company.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(domains !== undefined && {
            domains: normalizeDomains(domains),
          }),
          ...(logoUrl !== undefined && { logoUrl: logoUrl?.trim() || null }),
          ...(labelName !== undefined && {
            labelId: await resolveLabelId({
              emailAccountId,
              labelName,
              labelParentName,
            }),
          }),
        },
      });

      return { company };
    },
  );

// Assigning a contact to a company also teaches the company the contact's
// email domain, so everyone else on that domain groups with it automatically
async function resolveCompanyId({
  emailAccountId,
  companyName,
  contactEmail,
}: {
  emailAccountId: string;
  companyName: string | null | undefined;
  contactEmail: string;
}): Promise<string | null> {
  const name = companyName?.trim();
  if (!name) return null;

  const domain = contactEmail.split("@")[1] ?? "";
  const adoptDomain = !!domain && !isPublicEmailDomain(domain);

  const company = await prisma.company.upsert({
    where: { emailAccountId_name: { emailAccountId, name } },
    update: {},
    create: {
      emailAccountId,
      name,
      domains: adoptDomain ? [domain] : [],
    },
  });

  if (adoptDomain && !company.domains.includes(domain)) {
    await prisma.company.update({
      where: { id: company.id },
      data: { domains: [...company.domains, domain] },
    });
  }

  return company.id;
}

async function resolveLabelId({
  emailAccountId,
  labelName,
  labelParentName,
}: {
  emailAccountId: string;
  labelName: string | null | undefined;
  labelParentName: string | null | undefined;
}): Promise<string | null> {
  const name = labelName?.trim();
  if (!name) return null;

  const parentName = labelParentName?.trim();
  const parent = parentName
    ? await prisma.companyLabel.upsert({
        where: { emailAccountId_name: { emailAccountId, name: parentName } },
        update: {},
        create: { emailAccountId, name: parentName },
      })
    : null;

  const label = await prisma.companyLabel.upsert({
    where: { emailAccountId_name: { emailAccountId, name } },
    update: { ...(parent && { parentId: parent.id }) },
    create: { emailAccountId, name, parentId: parent?.id },
  });

  return label.id;
}

function normalizeDomains(domains: string[]): string[] {
  return [
    ...new Set(
      domains
        .map((domain) =>
          domain
            .trim()
            .toLowerCase()
            .replace(/^@/, "")
            .replace(/^www\./, ""),
        )
        .filter(Boolean),
    ),
  ];
}
