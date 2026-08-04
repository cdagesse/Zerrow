"use client";

import { useId, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/contacts/route";
import { SenderAvatar } from "@/components/email-list/SenderAvatar";
import { Input } from "@/components/ui/input";

// Assignee picker as drawn in the design: a free-text email input with a
// contact dropdown underneath. Picking fills the contact's email; any raw
// email works without a pick.
export function AssigneeAutocomplete({
  id,
  value,
  onChange,
  onPick,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  // Called when a contact is picked from the list (value already applied)
  onPick?: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // One roster load, filtered locally per keystroke — the endpoint search
  // re-aggregates activity server-side, which is overkill for a picker
  const { data } = useSWR<ContactsResponse>(
    open ? "/api/contacts?limit=500&sort=name" : null,
    { revalidateOnFocus: false },
  );

  const query = value.trim().toLowerCase();
  const options = useMemo(() => {
    const contacts = data?.contacts ?? [];
    return contacts
      .filter((contact) => !!contact.email)
      .filter(
        (contact) =>
          !query ||
          contact.email?.toLowerCase().includes(query) ||
          contact.name?.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [data, query]);

  const select = (email: string) => {
    onChange(email);
    onPick?.(email);
    // Return focus before closing: focusing the input runs its onFocus, which
    // opens the list again, so the close has to be the last update queued
    inputRef.current?.focus();
    setOpen(false);
  };

  return (
    // Focus moving from the input into an option must not close the list, so
    // closing keys off focus leaving the whole picker rather than the input
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        placeholder="Type a name or email…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open) focusOption(listRef.current, null, 1);
            else setOpen(true);
          }
        }}
      />
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-11 z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {options.map((contact) => (
            <button
              key={contact.email}
              type="button"
              role="option"
              aria-selected={contact.email?.toLowerCase() === query}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              // Selection lives in onClick so keyboard activation (Enter or
              // Space on the focused option) reaches it too; mousedown only
              // keeps focus in the input so the click still lands
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (contact.email) select(contact.email);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(
                    listRef.current,
                    event.currentTarget,
                    event.key === "ArrowDown" ? 1 : -1,
                  );
                  return;
                }
                if (event.key === "Escape") {
                  setOpen(false);
                  inputRef.current?.focus();
                }
              }}
            >
              <SenderAvatar
                name={contact.name || contact.email || "?"}
                className="size-[26px] text-[10px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {contact.name || contact.email}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {contact.email}
                </span>
              </span>
            </button>
          ))}
          {!options.length && (
            <p className="px-2 py-2 text-[12.5px] text-muted-foreground">
              No matching contacts — a raw email works too.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Arrow keys walk the rendered options relative to the focused one
function focusOption(
  list: HTMLDivElement | null,
  from: HTMLButtonElement | null,
  delta: number,
) {
  const options = [...(list?.querySelectorAll("button") ?? [])];
  if (!options.length) return;
  const current = from ? options.indexOf(from) : -1;
  const next = Math.min(Math.max(current + delta, 0), options.length - 1);
  options[next]?.focus();
}
