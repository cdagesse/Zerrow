// Minimal vCard 3.0 support: enough for iOS/macOS Contacts round-trips.
// We own name/email/phone/title/org; everything else a client sends is
// ignored rather than stored.

export type VCardContact = {
  uid: string;
  email: string;
  name: string | null;
  phone: string | null;
  title: string | null;
  companyName: string | null;
  updatedAt: Date;
};

export function generateVCard(contact: VCardContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${escapeValue(contact.uid)}`,
    `FN:${escapeValue(contact.name || contact.email)}`,
    `N:${escapeValue(lastName(contact.name))};${escapeValue(firstNames(contact.name))};;;`,
    `EMAIL;TYPE=INTERNET:${escapeValue(contact.email)}`,
    ...(contact.phone ? [`TEL;TYPE=CELL:${escapeValue(contact.phone)}`] : []),
    ...(contact.companyName ? [`ORG:${escapeValue(contact.companyName)}`] : []),
    ...(contact.title ? [`TITLE:${escapeValue(contact.title)}`] : []),
    `REV:${contact.updatedAt.toISOString()}`,
    "END:VCARD",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export type ParsedVCard = {
  uid: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  title: string | null;
  companyName: string | null;
};

export function parseVCard(raw: string): ParsedVCard {
  // Unfold continuation lines (RFC 2425: lines starting with space/tab)
  const unfolded = raw.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const result: ParsedVCard = {
    uid: null,
    email: null,
    name: null,
    phone: null,
    title: null,
    companyName: null,
  };

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).split(";")[0].toUpperCase();
    const value = unescapeValue(line.slice(colonIndex + 1).trim());
    if (!value) continue;

    switch (key) {
      case "UID":
        result.uid = value;
        break;
      case "FN":
        result.name = value;
        break;
      case "EMAIL":
        // First email wins (iOS lists the preferred one first)
        if (!result.email) result.email = value.toLowerCase();
        break;
      case "TEL":
        if (!result.phone) result.phone = value;
        break;
      case "TITLE":
        result.title = value;
        break;
      case "ORG":
        result.companyName = value.split(";")[0] || null;
        break;
      default:
        break;
    }
  }

  return result;
}

export function contactEtag(updatedAt: Date): string {
  return `"${updatedAt.getTime()}"`;
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function unescapeValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function lastName(name: string | null): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

function firstNames(name: string | null): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
}
