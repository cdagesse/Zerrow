import { isPublicEmailDomain } from "@/utils/email";

// No email in or out for this long → the relationship may be going stale
export const STALE_AFTER_DAYS = 90;

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
  title: string | null;
  phone: string | null;
  notes: string | null;
  aiSummary: string | null;
  photoUrl: string | null;
  useCompanyLogo: boolean;
  isPersonal: boolean;
  companyId: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  domains: string[];
  logoUrl: string | null;
  label: {
    id: string;
    name: string;
    parent: { id: string; name: string } | null;
  } | null;
};

export type ContactListItem = {
  email: string;
  domain: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  aiSummary: string | null;
  photoUrl: string | null;
  useCompanyLogo: boolean;
  isPersonal: boolean;
  companyId: string | null;
  receivedCount: number;
  sentCount: number;
  lastInteractionAt: Date | null;
  stale: boolean;
  isSaved: boolean;
};

export type ContactGroup = {
  // Company id, "domain:<domain>" for auto groups, "personal", or "other"
  key: string;
  name: string;
  logoUrl: string | null;
  domains: string[];
  company: CompanySummary | null;
  contacts: ContactListItem[];
};

export function mergeContactActivity({
  activity,
  saved,
  now = new Date(),
}: {
  activity: ContactActivity[];
  saved: SavedContact[];
  now?: Date;
}): ContactListItem[] {
  const savedByEmail = new Map(
    saved.map((contact) => [contact.email.toLowerCase(), contact]),
  );

  const toItem = (
    email: string,
    entry: ContactActivity | null,
    savedContact: SavedContact | undefined,
  ): ContactListItem => {
    const lastInteractionAt = entry?.lastInteractionAt ?? null;
    return {
      email,
      // Strip "www." so grouping, ignore filters, and company domain
      // matching (which normalize the same way) all agree
      domain: (email.split("@")[1] ?? "").replace(/^www\./, ""),
      name: savedContact?.name || entry?.name || null,
      title: savedContact?.title ?? null,
      phone: savedContact?.phone ?? null,
      notes: savedContact?.notes ?? null,
      aiSummary: savedContact?.aiSummary ?? null,
      photoUrl: savedContact?.photoUrl ?? null,
      useCompanyLogo: savedContact?.useCompanyLogo ?? true,
      isPersonal: savedContact?.isPersonal ?? false,
      companyId: savedContact?.companyId ?? null,
      receivedCount: entry?.receivedCount ?? 0,
      sentCount: entry?.sentCount ?? 0,
      lastInteractionAt,
      stale: isStale(lastInteractionAt, now),
      isSaved: !!savedContact,
    };
  };

  const merged = activity.map((entry) => {
    const email = entry.email.toLowerCase();
    const savedContact = savedByEmail.get(email);
    if (savedContact) savedByEmail.delete(email);
    return toItem(email, entry, savedContact);
  });

  // Saved contacts with no email activity (e.g. added manually)
  for (const savedContact of savedByEmail.values()) {
    merged.push(toItem(savedContact.email.toLowerCase(), null, savedContact));
  }

  return merged;
}

// Explicit assignment wins; otherwise a company claims contacts through its
// domains. Personal contacts never group by company.
export function resolveContactCompany(
  contact: Pick<ContactListItem, "companyId" | "domain" | "isPersonal">,
  companies: CompanySummary[],
): CompanySummary | null {
  if (contact.isPersonal) return null;
  if (contact.companyId) {
    return (
      companies.find((company) => company.id === contact.companyId) ?? null
    );
  }
  if (!contact.domain || isPublicEmailDomain(contact.domain)) return null;
  return (
    companies.find((company) => company.domains.includes(contact.domain)) ??
    null
  );
}

export function groupContacts({
  contacts,
  companies,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
}): ContactGroup[] {
  const groups = new Map<string, ContactGroup>();

  const groupFor = (contact: ContactListItem): ContactGroup => {
    if (contact.isPersonal) {
      return upsertGroup(groups, {
        key: "personal",
        name: "Personal",
        logoUrl: null,
        domains: [],
        company: null,
      });
    }

    const company = resolveContactCompany(contact, companies);
    if (company) {
      return upsertGroup(groups, {
        key: company.id,
        name: company.name,
        logoUrl:
          company.logoUrl ||
          (company.domains[0] ? domainLogoUrl(company.domains[0]) : null),
        domains: company.domains,
        company,
      });
    }

    if (contact.domain && !isPublicEmailDomain(contact.domain)) {
      return upsertGroup(groups, {
        key: `domain:${contact.domain}`,
        name: contact.domain,
        logoUrl: domainLogoUrl(contact.domain),
        domains: [contact.domain],
        company: null,
      });
    }

    return upsertGroup(groups, {
      key: "other",
      name: "Other",
      logoUrl: null,
      domains: [],
      company: null,
    });
  };

  for (const contact of contacts) {
    groupFor(contact).contacts.push(contact);
  }

  // Companies with no derived members still show (they may be newly created)
  for (const company of companies) {
    if (!groups.has(company.id)) {
      upsertGroup(groups, {
        key: company.id,
        name: company.name,
        logoUrl:
          company.logoUrl ||
          (company.domains[0] ? domainLogoUrl(company.domains[0]) : null),
        domains: company.domains,
        company,
      });
    }
  }

  const special = ["personal", "other"];
  return [...groups.values()].sort((a, b) => {
    const aSpecial = special.indexOf(a.key);
    const bSpecial = special.indexOf(b.key);
    if (aSpecial !== bSpecial)
      return (aSpecial + 1 || 99) - (bSpecial + 1 || 99);
    return b.contacts.length - a.contacts.length;
  });
}

// Auto domain groups that haven't been added as (or to) a company and
// haven't been dismissed — the "Suggested" list. Shared by the page, the
// tab count, and the sidebar so they can't drift apart.
export function pendingDomainGroups(
  groups: ContactGroup[],
  ignoredDomains: string[],
): ContactGroup[] {
  const ignored = new Set(ignoredDomains);
  return groups.filter(
    (group) =>
      group.key.startsWith("domain:") && !ignored.has(group.domains[0]),
  );
}

export function domainLogoUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

// The avatar shown for a contact: company logo by default, personal photo
// when the contact opted out of the company logo (or has no company)
export function contactAvatarUrl(
  contact: Pick<
    ContactListItem,
    "photoUrl" | "useCompanyLogo" | "isPersonal" | "companyId" | "domain"
  >,
  companies: CompanySummary[],
): string | null {
  if (contact.useCompanyLogo && !contact.isPersonal) {
    const company = resolveContactCompany(contact, companies);
    const companyLogo =
      company &&
      (company.logoUrl ||
        (company.domains[0] ? domainLogoUrl(company.domains[0]) : null));
    if (companyLogo) return companyLogo;
    // No saved company: the contact's own work domain still has a logo
    if (contact.domain && !isPublicEmailDomain(contact.domain)) {
      return domainLogoUrl(contact.domain);
    }
  }
  return contact.photoUrl;
}

function isStale(lastInteractionAt: Date | null, now: Date) {
  if (!lastInteractionAt) return false;
  const staleBefore = new Date(
    now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  );
  return new Date(lastInteractionAt) < staleBefore;
}

function upsertGroup(
  groups: Map<string, ContactGroup>,
  group: Omit<ContactGroup, "contacts">,
): ContactGroup {
  const existing = groups.get(group.key);
  if (existing) return existing;
  const created = { ...group, contacts: [] };
  groups.set(group.key, created);
  return created;
}
