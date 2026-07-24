"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ContactsList } from "./ContactsList";

export default function ContactsPage() {
  return (
    <PageWrapper>
      <PermissionsCheck />
      {/* Contacts are derived from the EmailMessage cache — keep it fresh */}
      <EmailStatsPreloader />
      <div className="pt-4">
        <ContactsList />
      </div>
    </PageWrapper>
  );
}
