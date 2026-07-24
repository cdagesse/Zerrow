"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { StickyNoteIcon } from "lucide-react";
import type { ContactsResponse } from "@/app/api/contacts/route";
import type { ContactListItem } from "@/utils/contacts";
import { SearchBar } from "@/components/SearchBar";
import { LoadingContent } from "@/components/LoadingContent";
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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function ContactsList() {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [selected, setSelected] = useState<ContactListItem | null>(null);

  // Tabs sync selection to the URL, so the sort lives there too
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort") === "frequent" ? "frequent" : "recent";

  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (search) params.set("search", search);
  const { data, isLoading, error, mutate } = useSWR<ContactsResponse>(
    `/api/contacts?${params.toString()}`,
    { keepPreviousData: true },
  );

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar onSearch={setSearch} className="sm:w-72" />
        <Tabs defaultValue="recent" searchParam="sort">
          <TabsList>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="frequent">Most emails</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-4">
        <LoadingContent loading={isLoading && !data} error={error}>
          {data &&
            (data.contacts.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Email
                      </TableHead>
                      <TableHead className="hidden sm:table-cell text-right">
                        Received
                      </TableHead>
                      <TableHead className="hidden sm:table-cell text-right">
                        Sent
                      </TableHead>
                      <TableHead className="text-right">
                        Last activity
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.contacts.map((contact) => (
                      <ContactRow
                        key={contact.email}
                        contact={contact}
                        onSelect={() => setSelected(contact)}
                      />
                    ))}
                  </TableBody>
                </Table>
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
        onClose={() => setSelected(null)}
        mutateContacts={mutate}
      />
    </div>
  );
}

function ContactRow({
  contact,
  onSelect,
}: {
  contact: ContactListItem;
  onSelect: () => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onSelect}>
      <TableCell>
        <div className="flex items-center gap-3 min-w-0">
          <ContactAvatar contact={contact} />
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
            {contact.company && (
              <div className="truncate text-sm text-muted-foreground">
                {contact.company}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">
        {contact.email}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-right tabular-nums">
        {contact.receivedCount}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-right tabular-nums">
        {contact.sentCount}
      </TableCell>
      <TableCell className="text-right text-sm text-muted-foreground sm:whitespace-nowrap">
        {contact.lastInteractionAt
          ? formatDistanceToNow(new Date(contact.lastInteractionAt), {
              addSuffix: true,
            })
          : "—"}
      </TableCell>
    </TableRow>
  );
}

export function ContactAvatar({
  contact,
  className,
}: {
  contact: Pick<ContactListItem, "name" | "email">;
  className?: string;
}) {
  const initial = (contact.name || contact.email).charAt(0).toUpperCase();
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
