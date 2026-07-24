"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeOffIcon,
  PlusIcon,
} from "lucide-react";
import {
  type CompanySummary,
  type ContactGroup,
  type ContactListItem,
  groupContacts,
  pendingDomainGroups,
} from "@/utils/contacts";
import {
  createCompanyAction,
  setDomainIgnoredAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactAvatar } from "./ContactsList";

// Domains seen in your email that aren't part of any saved company yet.
// Each can be added as a new company, added to an existing one, or ignored.
export function DomainSuggestions({
  contacts,
  companies,
  ignoredDomains,
  activeEmail,
  onSelectContact,
  mutate,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
  ignoredDomains: string[];
  activeEmail: string | null;
  onSelectContact: (contact: ContactListItem) => void;
  mutate: () => void;
}) {
  const [adding, setAdding] = useState<ContactGroup | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);

  const pending = useMemo(
    () =>
      pendingDomainGroups(
        groupContacts({ contacts, companies }),
        ignoredDomains,
      ),
    [contacts, companies, ignoredDomains],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          Domains from your email that aren't part of a company yet. Add the
          ones you care about — everyone on that domain groups under it.
        </p>
        {pending.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {pending.map((group) => (
              <SuggestionRow
                key={group.key}
                group={group}
                companies={companies}
                activeEmail={activeEmail}
                onSelectContact={onSelectContact}
                onAdd={() => setAdding(group)}
                mutate={mutate}
              />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            All caught up — no unadded domains right now.
          </p>
        )}
      </div>

      {ignoredDomains.length > 0 && (
        <div>
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70"
            onClick={() => setShowIgnored(!showIgnored)}
          >
            {showIgnored ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
            Ignored ({ignoredDomains.length})
          </button>
          {showIgnored && (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {[...ignoredDomains].sort().map((domain) => (
                <IgnoredRow key={domain} domain={domain} mutate={mutate} />
              ))}
            </div>
          )}
        </div>
      )}

      {adding && (
        <AddCompanyDialog
          group={adding}
          companies={companies}
          onClose={() => setAdding(null)}
          mutate={mutate}
        />
      )}
    </div>
  );
}

function SuggestionRow({
  group,
  companies,
  activeEmail,
  onSelectContact,
  onAdd,
  mutate,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  activeEmail: string | null;
  onSelectContact: (contact: ContactListItem) => void;
  onAdd: () => void;
  mutate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { emailAccountId } = useAccount();
  const domain = group.domains[0];

  const ignore = useAction(setDomainIgnoredAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: `Ignored ${domain}` });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <div className="bg-background">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setOpen(!open)}
        >
          {group.logoUrl && (
            // biome-ignore lint/performance/noImgElement: external favicons, not build assets
            <img
              src={group.logoUrl}
              alt=""
              width={32}
              height={32}
              className="size-7 shrink-0 rounded bg-muted object-cover p-0.5"
            />
          )}
          <span className="truncate text-sm font-semibold uppercase tracking-wide">
            {domain}
          </span>
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
            {group.contacts.length}{" "}
            {group.contacts.length === 1 ? "person" : "people"}
          </span>
          {open ? (
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <PlusIcon className="mr-1.5 size-3.5" />
          Add
        </Button>
        <Tooltip content="Ignore this domain">
          <Button
            variant="ghost"
            size="iconSm"
            disabled={ignore.isExecuting}
            onClick={() => ignore.execute({ domain, ignored: true })}
          >
            <span className="sr-only">Ignore domain</span>
            <EyeOffIcon className="size-4" />
          </Button>
        </Tooltip>
      </div>

      {open && (
        <div className="border-t border-border">
          {group.contacts.map((contact) => (
            <button
              key={contact.email}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50",
                contact.email === activeEmail && "bg-muted/50",
              )}
              onClick={() => onSelectContact(contact)}
            >
              <ContactAvatar contact={contact} companies={companies} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {contact.name || contact.email}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {contact.email}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IgnoredRow({
  domain,
  mutate,
}: {
  domain: string;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const restore = useAction(setDomainIgnoredAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: `Restored ${domain}` });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <div className="flex items-center gap-3 bg-background px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {domain}
      </span>
      <Button
        variant="outline"
        size="xs"
        loading={restore.isExecuting}
        onClick={() => restore.execute({ domain, ignored: false })}
      >
        Restore
      </Button>
    </div>
  );
}

function AddCompanyDialog({
  group,
  companies,
  onClose,
  mutate,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  onClose: () => void;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const domain = group.domains[0];
  const [name, setName] = useState(suggestCompanyName(domain));
  const [existingName, setExistingName] = useState("");
  // Which button submitted, so only that one shows the spinner
  const [intent, setIntent] = useState<"new" | "existing" | null>(null);

  const create = useAction(createCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company saved" });
      mutate();
      onClose();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {domain}</DialogTitle>
          <DialogDescription>
            Everyone emailing from {domain} will be grouped under this company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="new-company-name">Create a new company</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="new-company-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                loading={create.isExecuting && intent === "new"}
                disabled={!name.trim() || create.isExecuting}
                onClick={() => {
                  setIntent("new");
                  create.execute({ name: name.trim(), domains: [domain] });
                }}
              >
                Create
              </Button>
            </div>
          </div>

          {companies.length > 0 && (
            <div>
              <Label htmlFor="existing-company">
                Or add the domain to an existing company
              </Label>
              <div className="mt-2 flex gap-2">
                <Select value={existingName} onValueChange={setExistingName}>
                  <SelectTrigger id="existing-company" className="flex-1">
                    <SelectValue placeholder="Pick a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.name}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  loading={create.isExecuting && intent === "existing"}
                  disabled={!existingName || create.isExecuting}
                  // createCompanyAction upserts by name and merges domains,
                  // so this atomically teaches the picked company the domain
                  onClick={() => {
                    setIntent("existing");
                    create.execute({ name: existingName, domains: [domain] });
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "mail.anthropic.com" → "Anthropic": the second-to-last label is usually
// the brand — unless it's a public second-level suffix ("toyota.co.uk" must
// suggest "Toyota", not "Co"). The user can edit before saving.
const PUBLIC_SECOND_LEVELS = new Set([
  "co",
  "com",
  "net",
  "org",
  "ac",
  "gov",
  "edu",
]);

function suggestCompanyName(domain: string) {
  const parts = domain.split(".").filter(Boolean);
  let brand = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (parts.length >= 3 && PUBLIC_SECOND_LEVELS.has(brand)) {
    brand = parts[parts.length - 3];
  }
  if (!brand) return domain;
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}
