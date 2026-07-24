// The contacts list is derived data: activity aggregated from EmailMessage,
// overlaid with any user-saved Contact rows (notes, corrected names).

export type ContactActivity = {
  email: string;
  name: string | null;
  receivedCount: number;
  sentCount: number;
  lastInteractionAt: Date;
};

export type SavedContact = {
  email: string;
  name: string | null;
  company: string | null;
  notes: string | null;
};

export type ContactListItem = {
  email: string;
  name: string | null;
  company: string | null;
  notes: string | null;
  receivedCount: number;
  sentCount: number;
  lastInteractionAt: Date | null;
  isSaved: boolean;
};

export function mergeContactActivity({
  activity,
  saved,
}: {
  activity: ContactActivity[];
  saved: SavedContact[];
}): ContactListItem[] {
  const savedByEmail = new Map(
    saved.map((contact) => [contact.email.toLowerCase(), contact]),
  );

  const merged: ContactListItem[] = activity.map((entry) => {
    const savedContact = savedByEmail.get(entry.email.toLowerCase());
    if (savedContact) savedByEmail.delete(entry.email.toLowerCase());
    return {
      email: entry.email,
      name: savedContact?.name || entry.name,
      company: savedContact?.company ?? null,
      notes: savedContact?.notes ?? null,
      receivedCount: entry.receivedCount,
      sentCount: entry.sentCount,
      lastInteractionAt: entry.lastInteractionAt,
      isSaved: !!savedContact,
    };
  });

  // Saved contacts with no email activity (e.g. edited before history synced)
  for (const savedContact of savedByEmail.values()) {
    merged.push({
      email: savedContact.email.toLowerCase(),
      name: savedContact.name,
      company: savedContact.company,
      notes: savedContact.notes,
      receivedCount: 0,
      sentCount: 0,
      lastInteractionAt: null,
      isSaved: true,
    });
  }

  return merged;
}
