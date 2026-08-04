"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckIcon, EyeOffIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import type { ContactsResponse } from "@/app/api/contacts/route";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { resolveContactCardExchangeAction } from "@/utils/actions/contact-card";
import { getActionErrorMessage } from "@/utils/error";

type PendingExchange = ContactsResponse["pendingExchanges"][number];

// People who opened your card and handed their details back. They're held
// out of the address book until you accept, so nothing anonymous writes
// straight into it.
export function ExchangeSuggestions({
  pending,
  mutateContacts,
}: {
  pending: PendingExchange[];
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  // Resolved rows leave immediately; the server call follows. A failed call
  // puts the row back, otherwise the decision can't be retried without a
  // refetch
  const [resolved, setResolved] = useState<string[]>([]);

  const resolve = useAction(
    resolveContactCardExchangeAction.bind(null, emailAccountId),
    {
      // Confirm the save only once the server has actually made it
      onSuccess: ({ input }) => {
        if (input.accept) {
          const entry = pending.find((row) => row.id === input.exchangeId);
          if (entry) toastSuccess({ description: `${entry.name} added` });
        }
        mutateContacts();
      },
      onError: ({ error, input }) => {
        setResolved((current) =>
          current.filter((id) => id !== input.exchangeId),
        );
        toastError({ description: getActionErrorMessage(error) });
      },
    },
  );

  const visible = pending.filter((entry) => !resolved.includes(entry.id));
  if (!visible.length) return null;

  return (
    <div className="mb-5 rounded-[10px] border border-border bg-card p-3.5">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        Shared their details
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        From the Exchange form on your card. Adding one saves them as a contact.
      </p>

      <div className="mt-3 space-y-1">
        {visible.map((entry) => (
          <div
            className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted"
            key={entry.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {[entry.email, entry.companyTitle, entry.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {entry.note && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  “{entry.note}”
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground/70">
                {formatDistanceToNow(new Date(entry.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            <Button
              onClick={() => {
                setResolved((current) => [...current, entry.id]);
                resolve.execute({ exchangeId: entry.id, accept: false });
              }}
              size="sm"
              title="Dismiss"
              variant="ghost"
            >
              <EyeOffIcon className="size-3.5" />
            </Button>
            <Button
              onClick={() => {
                setResolved((current) => [...current, entry.id]);
                resolve.execute({ exchangeId: entry.id, accept: true });
              }}
              size="sm"
            >
              <CheckIcon className="mr-1.5 size-3.5" />
              Add
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
