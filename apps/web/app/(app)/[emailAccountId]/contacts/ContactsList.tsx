"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, RefreshCwIcon, StickyNoteIcon } from "lucide-react";
import type { ContactsResponse } from "@/app/api/contacts/route";
import {
  contactAvatarUrl,
  type CompanySummary,
  type ContactListItem,
  resolveContactCompany,
} from "@/utils/contacts";
import { SearchBar } from "@/components/SearchBar";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContactDetailSheet } from "./ContactDetailSheet";
import { CompaniesView } from "./CompaniesView";
import { AddContactDialog } from "./AddContactDialog";
import { SyncSettingsDialog } from "./SyncSettingsDialog";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function ContactsList() {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  // Track selection by email so the sheet re-reads fresh data after mutations
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSync, setShowSync] = useState(false);

  // Tabs sync selection to the URL, so view and sort live there too
  const searchParams = useSearchParams();
  const view =
    searchParams.get("view") === "companies" ? "companies" : "people";
  const sort = searchParams.get("sort") === "frequent" ? "frequent" : "recent";

  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (search) params.set("search", search);
  const { data, isLoading, error, mutate } = useSWR<ContactsResponse>(
    `/api/contacts?${params.toString()}`,
    { keepPreviousData: true },
  );

  const companies = data?.companies ?? [];
  const selected = selectedEmail
    ? (data?.contacts.find((contact) => contact.email === selectedEmail) ??
      null)
    : null;
  const setSelected = (contact: ContactListItem) =>
    setSelectedEmail(contact.email);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar onSearch={setSearch} className="w-full sm:w-64" />
        <Tabs defaultValue="people" searchParam="view">
          <TabsList>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="companies">Companies</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === "people" && (
          <Tabs defaultValue="recent" searchParam="sort">
            <TabsList>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="frequent">Most emails</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSync(true)}>
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            Sync
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon className="mr-1.5 size-4" />
            Add contact
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <LoadingContent loading={isLoading && !data} error={error}>
          {data &&
            (data.contacts.length || companies.length ? (
              view === "companies" ? (
                <CompaniesView
                  contacts={data.contacts}
                  companies={companies}
                  onSelectContact={setSelected}
                  mutate={mutate}
                />
              ) : (
                <>
                  <PeopleTable
                    contacts={data.contacts}
                    companies={companies}
                    onSelect={setSelected}
                  />
                  {data.hasMore && limit < MAX_LIMIT && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLimit(MAX_LIMIT)}
                      >
                        Show more
                      </Button>
                    </div>
                  )}
                </>
              )
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {search
                  ? `No contacts match “${search}”.`
                  : "No contacts yet. They'll appear here as your email history loads."}
              </p>
            ))}
        </LoadingContent>
      </div>

      <ContactDetailSheet
        contact={selected}
        companies={companies}
        onClose={() => setSelectedEmail(null)}
        mutateContacts={mutate}
      />
      <AddContactDialog
        open={adding}
        onClose={() => setAdding(false)}
        mutateContacts={mutate}
      />
      {data && (
        <SyncSettingsDialog
          open={showSync}
          onClose={() => setShowSync(false)}
          sync={data.sync}
          mutateContacts={mutate}
        />
      )}
    </div>
  );
}

function PeopleTable({
  contacts,
  companies,
  onSelect,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
  onSelect: (contact: ContactListItem) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="hidden md:table-cell">Email</TableHead>
          <TableHead className="hidden xl:table-cell">Company</TableHead>
          <TableHead className="hidden sm:table-cell text-right">
            Received
          </TableHead>
          <TableHead className="hidden sm:table-cell text-right">
            Sent
          </TableHead>
          <TableHead className="text-right">Last activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <ContactRow
            key={contact.email}
            contact={contact}
            companies={companies}
            onSelect={() => onSelect(contact)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function ContactRow({
  contact,
  companies,
  onSelect,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  onSelect: () => void;
}) {
  const company = resolveContactCompany(contact, companies);
  const groupName = contact.isPersonal ? "Personal" : company?.name;

  return (
    <TableRow className="cursor-pointer" onClick={onSelect}>
      <TableCell>
        <div className="flex items-center gap-3 min-w-0">
          <ContactAvatar contact={contact} companies={companies} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate font-medium">
              {contact.name || contact.email}
              {contact.notes && (
                <StickyNoteIcon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </div>
            <div className="truncate text-sm text-muted-foreground md:hidden">
              {contact.email}
            </div>
            {(contact.title || groupName) && (
              <div className="truncate text-sm text-muted-foreground">
                {[contact.title, groupName].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">
        {contact.email}
      </TableCell>
      <TableCell className="hidden xl:table-cell text-muted-foreground">
        {groupName ?? "—"}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-right tabular-nums">
        {contact.receivedCount}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-right tabular-nums">
        {contact.sentCount}
      </TableCell>
      <TableCell className="text-right text-sm text-muted-foreground sm:whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          {contact.stale && <Badge color="yellow">Stale</Badge>}
          {contact.lastInteractionAt
            ? formatDistanceToNow(new Date(contact.lastInteractionAt), {
                addSuffix: true,
              })
            : "—"}
        </span>
      </TableCell>
    </TableRow>
  );
}

export function ContactAvatar({
  contact,
  companies,
  className,
}: {
  contact: Pick<
    ContactListItem,
    | "name"
    | "email"
    | "photoUrl"
    | "useCompanyLogo"
    | "isPersonal"
    | "companyId"
    | "domain"
  >;
  companies: CompanySummary[];
  className?: string;
}) {
  const src = contactAvatarUrl(contact, companies);
  const initial = (contact.name || contact.email).charAt(0).toUpperCase();

  if (src) {
    return (
      // biome-ignore lint/performance/noImgElement: external favicons/photos, not build assets
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        className={
          className ??
          "size-8 shrink-0 rounded-full bg-muted object-cover p-0.5"
        }
      />
    );
  }

  return (
    <div
      className={
        className ??
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
      }
    >
      {initial}
    </div>
  );
}
