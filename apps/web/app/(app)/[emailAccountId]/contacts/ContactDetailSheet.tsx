"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import { MailIcon } from "lucide-react";
import type { ContactListItem } from "@/utils/contacts";
import { updateContactAction } from "@/utils/actions/contact";
import type { UpdateContactBody } from "@/utils/actions/contact.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useThreads } from "@/hooks/useThreads";
import { prefixPath } from "@/utils/path";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { EmailList } from "@/components/email-list/EmailList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  onClose,
  mutateContacts,
}: {
  contact: ContactListItem | null;
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
            mutateContacts={mutateContacts}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactDetails({
  contact,
  mutateContacts,
}: {
  contact: ContactListItem;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();

  return (
    <div className="space-y-6">
      <SheetHeader className="space-y-1">
        <div className="flex items-center gap-3">
          <ContactAvatar
            contact={contact}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-medium"
          />
          <div className="min-w-0">
            <SheetTitle className="truncate">
              {contact.name || contact.email}
            </SheetTitle>
            <SheetDescription className="truncate">
              {contact.email}
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

      <ContactEditForm contact={contact} mutateContacts={mutateContacts} />

      <RecentEmails email={contact.email} />
    </div>
  );
}

function ContactEditForm({
  contact,
  mutateContacts,
}: {
  contact: ContactListItem;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();

  const { register, handleSubmit } = useForm<
    Pick<UpdateContactBody, "name" | "company" | "notes">
  >({
    defaultValues: {
      name: contact.name ?? "",
      company: contact.company ?? "",
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
        update.execute({ email: contact.email, ...values }),
      )}
    >
      <div>
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          className="mt-2"
          placeholder="Their name"
          {...register("name")}
        />
      </div>
      <div>
        <Label htmlFor="contact-company">Company</Label>
        <Input
          id="contact-company"
          className="mt-2"
          placeholder="Where they work"
          {...register("company")}
        />
      </div>
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
