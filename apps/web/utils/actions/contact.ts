"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { updateContactBody } from "@/utils/actions/contact.validation";
import prisma from "@/utils/prisma";

export const updateContactAction = actionClient
  .metadata({ name: "updateContact" })
  .inputSchema(updateContactBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { email, name, company, notes },
    }) => {
      const normalizedEmail = email.trim().toLowerCase();
      // Only touch fields the caller sent, so partial updates can't wipe
      // previously saved details
      const details = {
        ...(name !== undefined && { name: name?.trim() || null }),
        ...(company !== undefined && { company: company?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
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
