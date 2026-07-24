"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, RefreshCwIcon, StickyNoteIcon } from "lucide-react";
import type { ContactsResponse } from "@/app/api/contacts/route";
import {
  contactAvatarUrl,
  type CompanySummary,
  type ContactListItem,
  groupContacts,
  resolveContactCompany,
} from "@/utils/contacts";
import { cn } from "@/utils";
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
import { ContactDetails, ContactDetailSheet } from "./ContactDetailSheet";
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

  // Tabs sync selection to the URL, so view and sort live there too;
  // the sidebar's GROUPS panel drives ?group= and ?label=. The
  // company-grouped list is the main view; a group selection shows people.
  const searchParams = useSearchParams();
  const view =
    searchParams.get("view") === "people" || searchParams.get("group")
      ? "people"
      : "companies";
  const sort = searchParams.get("sort") === "frequent" ? "frequent" : "recent";
  const groupKey = searchParams.get("group");
  const labelFilter = searchParams.get("label");

  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (search) params.set("search", search);
  const { data, isLoading, error, mutate } = useSWR<ContactsResponse>(
    `/api/contacts?${params.toString()}`,
    { keepPreviousData: true },
  );

  const companies = data?.companies ?? [];

  const groups = useMemo(
    () => groupContacts({ contacts: data?.contacts ?? [], companies }),
    [data?.contacts, companies],
  );

  // Scope contacts to the sidebar selection (a group or a label) so the
  // people view and the detail-pane fallback both respect it
  const filteredContacts = useMemo(() => {
    if (groupKey) {
      return groups.find((group) => group.key === groupKey)?.contacts ?? [];
    }
    if (labelFilter) {
      return groups
        .filter(
          (group) =>
            group.company?.label?.id === labelFilter ||
            group.company?.label?.parent?.id === labelFilter,
        )
        .flatMap((group) => group.contacts);
    }
    return data?.contacts ?? [];
  }, [data?.contacts, groups, groupKey, labelFilter]);

  const activeLabelName = labelFilter
    ? groups
        .flatMap((group) => {
          const label = group.company?.label;
          return label ? [label, ...(label.parent ? [label.parent] : [])] : [];
        })
        .find((label) => label.id === labelFilter)?.name
    : null;

  const activeGroupName = groupKey
    ? groups.find((group) => group.key === groupKey)?.name
    : activeLabelName;

  const selected = selectedEmail
    ? (data?.contacts.find((contact) => contact.email === selectedEmail) ??
      null)
    : null;
  const setSelected = (contact: ContactListItem) =>
    setSelectedEmail(contact.email);

  const isWide = useIsWideScreen();

  // The detail pane is always populated on wide screens: fall back to the
  // first contact in the current view when nothing is explicitly selected
  const displayed = selected ?? filteredContacts[0] ?? null;
  const activeEmail = isWide ? (displayed?.email ?? null) : null;

  const companyCount = groups.filter(
    (group) => group.key !== "personal" && group.key !== "other",
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <h1 className="font-display text-2xl leading-7 tracking-tight lg:text-3xl">
              Contacts
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data ? (
                activeGroupName ? (
                  <>
                    Showing{" "}
                    <span className="text-foreground">{activeGroupName}</span> ·{" "}
                    {filteredContacts.length}{" "}
                    {filteredContacts.length === 1 ? "person" : "people"}
                  </>
                ) : (
                  <>
                    {data.contacts.length} people · {companyCount} companies
                  </>
                )
              ) : (
                "Everyone you email, built automatically from your mail history."
              )}
            </p>
          </div>
          <SearchBar
            onSearch={setSearch}
            placeholder="Search people, companies, titles..."
            className="w-full min-w-0 flex-1 sm:w-auto sm:max-w-md"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSync(true)}
            >
              <RefreshCwIcon className="mr-1.5 size-3.5" />
              Sync
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="mr-1.5 size-4" />
              Add contact
            </Button>
          </div>
        </div>

        {/* A sidebar group selection speaks for itself; tabs would contradict it */}
        {!groupKey && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Tabs defaultValue="companies" searchParam="view">
              <TabsList>
                <TabsTrigger value="companies">Companies</TabsTrigger>
                <TabsTrigger value="people">People</TabsTrigger>
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
          </div>
        )}
      </div>

      {/* Each pane scrolls internally, like the mail view */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          <LoadingContent loading={isLoading && !data} error={error}>
            {data &&
              (data.contacts.length || companies.length ? (
                view === "companies" ? (
                  <CompaniesView
                    contacts={data.contacts}
                    companies={companies}
                    labelFilter={labelFilter}
                    activeEmail={activeEmail}
                    onSelectContact={setSelected}
                    mutate={mutate}
                  />
                ) : (
                  <>
                    <PeopleTable
                      contacts={filteredContacts}
                      companies={companies}
                      activeEmail={activeEmail}
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

        {/* Persistent detail pane on wide screens (the sheet covers the
            rest). The container is CSS-gated so the list doesn't reflow
            when the isWide hook resolves after hydration; the content is
            JS-gated so narrow screens never mount it (or its fetches). */}
        <aside className="hidden w-[400px] shrink-0 overflow-y-auto border-l border-border p-5 xl:block">
          {isWide && displayed ? (
            <ContactDetails
              key={displayed.email}
              contact={displayed}
              companies={companies}
              mutateContacts={mutate}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Select a contact to see their details.
            </p>
          )}
        </aside>
      </div>

      <ContactDetailSheet
        contact={isWide ? null : selected}
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
  activeEmail,
  onSelect,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
  activeEmail: string | null;
  onSelect: (contact: ContactListItem) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {/* 2xl, not xl: at exactly 1280px the 400px detail pane appears
              and this column would force a nested horizontal scrollbar */}
          <TableHead className="hidden 2xl:table-cell">Company</TableHead>
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
            active={contact.email === activeEmail}
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
  active,
  onSelect,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  active: boolean;
  onSelect: () => void;
}) {
  const company = resolveContactCompany(contact, companies);
  const groupName = contact.isPersonal ? "Personal" : company?.name;

  return (
    <TableRow
      className={cn("cursor-pointer", active && "bg-muted/50")}
      onClick={onSelect}
    >
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
            <div className="truncate text-sm text-muted-foreground">
              {[contact.email, contact.title].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden 2xl:table-cell text-muted-foreground">
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

// The persistent detail pane needs real width; below xl the sheet takes over
function useIsWideScreen() {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return wide;
}
