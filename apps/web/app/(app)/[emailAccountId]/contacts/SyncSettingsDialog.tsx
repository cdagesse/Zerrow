"use client";

import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import {
  setGoogleContactsSyncAction,
  syncGoogleContactsAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SyncState = {
  provider: string | null;
  googleEnabled: boolean;
  googleSyncedAt: Date | string | null;
};

export function SyncSettingsDialog({
  open,
  onClose,
  sync,
  mutateContacts,
}: {
  open: boolean;
  onClose: () => void;
  sync: SyncState;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();

  const toggle = useAction(
    setGoogleContactsSyncAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        toastSuccess({
          description: result.data?.enabled
            ? "Google Contacts sync is on"
            : "Google Contacts sync is off",
        });
        mutateContacts();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
        mutateContacts();
      },
    },
  );

  const syncNow = useAction(
    syncGoogleContactsAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        const { created = 0, updated = 0, deleted = 0 } = result.data ?? {};
        toastSuccess({
          description: `Synced: ${created} new, ${updated} updated, ${deleted} removed`,
        });
        mutateContacts();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const isGoogle = sync.provider === "google";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact sync</DialogTitle>
        </DialogHeader>

        {isGoogle ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="google-sync">Google Contacts</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Two-way sync: pulls your Google contacts in, and pushes name,
                  title, company, and phone edits back.
                </p>
              </div>
              <Switch
                id="google-sync"
                checked={sync.googleEnabled}
                disabled={toggle.isExecuting}
                onCheckedChange={(enabled) => toggle.execute({ enabled })}
              />
            </div>

            {sync.googleEnabled && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  {sync.googleSyncedAt
                    ? `Last synced ${formatDistanceToNow(
                        new Date(sync.googleSyncedAt),
                        { addSuffix: true },
                      )}. Also syncs hourly.`
                    : "Not synced yet."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  loading={syncNow.isExecuting}
                  onClick={() => syncNow.execute({})}
                >
                  Sync now
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Requires the Google Contacts permission. If sync fails with a
              permission error, sign out and back in to grant it (the
              NEXT_PUBLIC_CONTACTS_ENABLED flag must be on so login requests the
              contacts scope).
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact sync is currently available for Google accounts only.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
