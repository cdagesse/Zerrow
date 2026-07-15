"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { SettingsIcon, TagIcon } from "lucide-react";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { toastError, toastSuccess } from "@/components/Toast";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  updateLabelsAction,
  updateLabelVisibilityAction,
} from "@/utils/actions/mail";
import { getActionErrorMessage } from "@/utils/error";
import { isGoogleProvider } from "@/utils/email/provider-types";

// Header row for label folder views: folder name plus the settings gear.
// Rendered above the list so it's available even when the folder is empty.
export function FolderHeader({ labelId }: { labelId: string }) {
  const { userLabels } = useLabels();
  const label = userLabels.find((userLabel) => userLabel.id === labelId);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <TagIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          {label?.name ?? "Folder"}
        </span>
      </div>
      <FolderSettings labelId={labelId} />
    </div>
  );
}

export function FolderSettings({ labelId }: { labelId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip content="Folder settings">
        <SheetTrigger asChild>
          <Button variant="ghost" size="iconSm">
            <span className="sr-only">Folder settings</span>
            <SettingsIcon className="size-4" />
          </Button>
        </SheetTrigger>
      </Tooltip>
      <SheetContent side="right" className="overflow-y-auto">
        {open && <FolderSettingsContent labelId={labelId} />}
      </SheetContent>
    </Sheet>
  );
}

function FolderSettingsContent({ labelId }: { labelId: string }) {
  const { emailAccountId, provider } = useAccount();
  const { userLabels, isLoading, error, mutate } = useLabels();
  const {
    data: dbLabels,
    isLoading: isLoadingDbLabels,
    mutate: mutateDbLabels,
  } = useSWR<UserLabelsResponse>("/api/user/labels");

  const label = userLabels.find((userLabel) => userLabel.id === labelId);
  const dbLabel = dbLabels?.find(
    (candidate) => candidate.gmailLabelId === labelId,
  );

  return (
    <LoadingContent loading={isLoading || isLoadingDbLabels} error={error}>
      {label ? (
        <>
          <SheetHeader>
            <SheetTitle>{label.name}</SheetTitle>
            <SheetDescription>Settings for this folder</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            {isGoogleProvider(provider) && (
              <VisibilitySetting
                labelId={labelId}
                visible={label.labelListVisibility !== "labelHide"}
                mutateLabels={mutate}
              />
            )}

            <AiLabelSetting
              key={labelId}
              emailAccountId={emailAccountId}
              labelId={labelId}
              labelName={label.name}
              initialEnabled={dbLabel?.enabled ?? false}
              initialDescription={dbLabel?.description ?? ""}
              mutateDbLabels={mutateDbLabels}
            />
          </div>
        </>
      ) : (
        <SheetHeader>
          <SheetTitle>Folder not found</SheetTitle>
        </SheetHeader>
      )}
    </LoadingContent>
  );
}

function VisibilitySetting({
  labelId,
  visible,
  mutateLabels,
}: {
  labelId: string;
  visible: boolean;
  mutateLabels: () => void;
}) {
  const { emailAccountId } = useAccount();

  const { execute, isExecuting } = useAction(
    updateLabelVisibilityAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder visibility updated" });
        mutateLabels();
      },
      onError: (error) => {
        toastError(getActionErrorMessage(error.error));
      },
    },
  );

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor="folder-visible">Show in sidebar</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Hidden folders stay usable but move under the sidebar's "More" toggle.
        </p>
      </div>
      <Switch
        id="folder-visible"
        checked={visible}
        disabled={isExecuting}
        onCheckedChange={(checked) => execute({ labelId, visible: checked })}
      />
    </div>
  );
}

function AiLabelSetting({
  emailAccountId,
  labelId,
  labelName,
  initialEnabled,
  initialDescription,
  mutateDbLabels,
}: {
  emailAccountId: string;
  labelId: string;
  labelName: string;
  initialEnabled: boolean;
  initialDescription: string;
  mutateDbLabels: () => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [description, setDescription] = useState(initialDescription);

  const { execute, isExecuting } = useAction(
    updateLabelsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder AI settings saved" });
        mutateDbLabels();
      },
      onError: (error) => {
        toastError(getActionErrorMessage(error.error));
      },
    },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="folder-ai-enabled">AI can use this folder</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Let the AI assistant move emails into this folder.
          </p>
        </div>
        <Switch
          id="folder-ai-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div>
        <Label htmlFor="folder-ai-description">Description for the AI</Label>
        <Textarea
          id="folder-ai-description"
          className="mt-2"
          rows={3}
          placeholder="Which emails belong in this folder?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <Button
        loading={isExecuting}
        onClick={() =>
          execute({
            labels: [
              {
                name: labelName,
                description: description || undefined,
                enabled,
                gmailLabelId: labelId,
              },
            ],
          })
        }
      >
        Save
      </Button>
    </div>
  );
}
