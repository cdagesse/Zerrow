"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import { MailIcon } from "lucide-react";
import {
  type CompanySummary,
  type ContactListItem,
  resolveContactCompany,
} from "@/utils/contacts";
import { updateContactAction } from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useThreads } from "@/hooks/useThreads";
import { prefixPath } from "@/utils/path";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { EmailList } from "@/components/email-list/EmailList";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContactAvatar } from "./ContactsList";

export function ContactDetailSheet({
  contact,
  companies,
  onClose,
  mutateContacts,
}: {
  contact: ContactListItem | null;
  companies: CompanySummary[];
  onClose: () => void;
  mutateContacts: () => void;
}) {
  return (
    <Sheet open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        {contact && (
          <ContactDetails
            key={contact.email}
            contact={contact}
            companies={companies}
            mutateContacts={mutateContacts}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactDetails({
  contact,
  companies,
  mutateContacts,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  const company = resolveContactCompany(contact, companies);

  return (
    <div className="space-y-6">
      <SheetHeader className="space-y-1">
        <div className="flex items-center gap-3">
          <ContactAvatar
            contact={contact}
            companies={companies}
            className="size-10 shrink-0 rounded-full bg-muted object-cover p-0.5"
          />
          <div className="min-w-0">
            <SheetTitle className="truncate">
              {contact.name || contact.email}
            </SheetTitle>
            <SheetDescription className="truncate">
              {[contact.title, company?.name, contact.email]
                .filter(Boolean)
                .join(" · ")}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{contact.receivedCount} received</span>
        <span>{contact.sentCount} sent</span>
        {contact.lastInteractionAt && (
          <span>
            Last activity{" "}
            {formatDistanceToNow(new Date(contact.lastInteractionAt), {
              addSuffix: true,
            })}
          </span>
        )}
        {contact.stale && <Badge color="yellow">Stale</Badge>}
      </div>

      <Button asChild variant="outline" size="sm">
        <Link
          href={prefixPath(
            emailAccountId,
            `/mail?q=${encodeURIComponent(contact.email)}`,
          )}
        >
          <MailIcon className="mr-1.5 size-3.5" />
          Search in Mail
        </Link>
      </Button>

      <ContactEditForm
        contact={contact}
        companyName={company?.name ?? ""}
        mutateContacts={mutateContacts}
      />

      {contact.aiSummary && (
        <div>
          <h3 className="mb-2 text-sm font-medium">AI summary</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {contact.aiSummary}
          </p>
        </div>
      )}

      <RecentEmails email={contact.email} />
    </div>
  );
}

function ContactEditForm({
  contact,
  companyName,
  mutateContacts,
}: {
  contact: ContactListItem;
  companyName: string;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [isPersonal, setIsPersonal] = useState(contact.isPersonal);
  const [useCompanyLogo, setUseCompanyLogo] = useState(contact.useCompanyLogo);

  const { register, handleSubmit } = useForm<{
    name: string;
    title: string;
    phone: string;
    companyName: string;
    photoUrl: string;
    notes: string;
  }>({
    defaultValues: {
      name: contact.name ?? "",
      title: contact.title ?? "",
      phone: contact.phone ?? "",
      companyName,
      photoUrl: contact.photoUrl ?? "",
      notes: contact.notes ?? "",
    },
  });

  const update = useAction(updateContactAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Contact saved" });
      mutateContacts();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        update.execute({
          email: contact.email,
          name: values.name,
          title: values.title,
          phone: values.phone,
          companyName: values.companyName,
          photoUrl: values.photoUrl.trim(),
          notes: values.notes,
          isPersonal,
          useCompanyLogo,
        }),
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" className="mt-2" {...register("name")} />
        </div>
        <div>
          <Label htmlFor="contact-title">Title</Label>
          <Input
            id="contact-title"
            className="mt-2"
            placeholder="e.g. Plant Manager"
            {...register("title")}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contact-company">Company</Label>
          <Input
            id="contact-company"
            className="mt-2"
            disabled={isPersonal}
            placeholder="Where they work"
            {...register("companyName")}
          />
        </div>
        <div>
          <Label htmlFor="contact-phone">Phone</Label>
          <Input id="contact-phone" className="mt-2" {...register("phone")} />
        </div>
      </div>
      <div>
        <Label htmlFor="contact-photo">Photo URL</Label>
        <Input
          id="contact-photo"
          className="mt-2"
          placeholder="https://…"
          {...register("photoUrl")}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="contact-personal">Personal contact</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Grouped under Personal instead of a company.
          </p>
        </div>
        <Switch
          id="contact-personal"
          checked={isPersonal}
          onCheckedChange={setIsPersonal}
        />
      </div>
      {!isPersonal && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="contact-company-logo">Use company logo</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Off shows their personal photo instead.
            </p>
          </div>
          <Switch
            id="contact-company-logo"
            checked={useCompanyLogo}
            onCheckedChange={setUseCompanyLogo}
          />
        </div>
      )}
      <div>
        <Label htmlFor="contact-notes">Notes</Label>
        <Textarea
          id="contact-notes"
          className="mt-2"
          rows={4}
          placeholder="Anything worth remembering about this person"
          {...register("notes")}
        />
      </div>
      <Button type="submit" size="sm" loading={update.isExecuting}>
        Save
      </Button>
    </form>
  );
}

function RecentEmails({ email }: { email: string }) {
  const { data, isLoading, error, mutate } = useThreads({
    fromEmail: email,
    type: "all",
    limit: 10,
  });

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Recent emails</h3>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <EmailList
            threads={data.threads}
            emptyMessage={
              <p className="py-4 text-sm text-muted-foreground">
                No emails from this contact.
              </p>
            }
            hideActionBarWhenEmpty
            refetch={() => mutate()}
          />
        )}
      </LoadingContent>
    </div>
  );
}
