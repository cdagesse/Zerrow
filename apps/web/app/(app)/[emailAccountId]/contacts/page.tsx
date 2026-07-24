"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
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
        <PageHeader
          title="Contacts"
          description="Everyone you email, built automatically from your mail history."
        />
      </div>
      <div className="mt-6">
        <ContactsList />
      </div>
    </PageWrapper>
  );
}
