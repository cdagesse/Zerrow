"use client";

import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { ContactsList } from "./ContactsList";

export default function ContactsPage() {
  return (
    // Pin the contacts app to the visible screen like the mail view — each
    // pane scrolls internally instead of the page growing. On mobile the
    // bottom offset clears the fixed app tray (3.5rem + safe area).
    <div className="flex flex-col overflow-hidden max-md:fixed max-md:inset-x-0 max-md:top-9 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:h-[calc(100svh-2.25rem)]">
      <PermissionsCheck />
      {/* Contacts are derived from the EmailMessage cache — keep it fresh */}
      <EmailStatsPreloader />
      <ContactsList />
    </div>
  );
}
