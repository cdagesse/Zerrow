"use client";

import { PinnedPage } from "@/components/PinnedPage";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ContactsList } from "./ContactsList";

export default function ContactsPage() {
  return (
    <PinnedPage>
      <PermissionsCheck />
      {/* Contacts are derived from the EmailMessage cache — keep it fresh */}
      <EmailStatsPreloader />
      <ContactsList />
    </PinnedPage>
  );
}
