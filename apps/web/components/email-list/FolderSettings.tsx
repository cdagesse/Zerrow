"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { SettingsIcon, SparklesIcon } from "lucide-react";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import type { FolderRuleResponse } from "@/app/api/user/rules/label/[labelId]/route";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { toastError, toastSuccess } from "@/components/Toast";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  updateLabelAction,
  updateLabelVisibilityAction,
} from "@/utils/actions/mail";
import {
  generateFolderInstructionsAction,
  saveFolderRuleAction,
} from "@/utils/actions/folder-rule";
import { getActionErrorMessage } from "@/utils/error";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { LABEL_ICONS, getLabelIcon } from "@/utils/label-icons";
import { cn } from "@/utils";
import { LogicalOperator } from "@/generated/prisma/enums";

// Header row for label folder views: folder name plus the settings gear.
// Rendered above the list so it's available even when the folder is empty.
export function FolderHeader({ labelId }: { labelId: string }) {
  const { userLabels } = useLabels();
  const { data: dbLabels } = useSWR<UserLabelsResponse>("/api/user/labels");
  const label = userLabels.find((userLabel) => userLabel.id === labelId);
  const Icon = getLabelIcon(
    dbLabels?.find((candidate) => candidate.gmailLabelId === labelId)?.icon,
  );

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          {label?.name.split("/").pop() ?? "Folder"}
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
    error: dbLabelsError,
    mutate: mutateDbLabels,
  } = useSWR<UserLabelsResponse>("/api/user/labels");

  const label = userLabels.find((userLabel) => userLabel.id === labelId);
  const dbLabel = dbLabels?.find(
    (candidate) => candidate.gmailLabelId === labelId,
  );

  return (
    <LoadingContent
      loading={isLoading || isLoadingDbLabels}
      error={error || dbLabelsError}
    >
      {label ? (
        <>
          <SheetHeader>
            <SheetTitle>{label.name}</SheetTitle>
            <SheetDescription>Settings for this folder</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            <IconSetting
              key={`icon-${labelId}`}
              emailAccountId={emailAccountId}
              labelId={labelId}
              labelName={label.name}
              dbLabel={dbLabel}
              mutateDbLabels={mutateDbLabels}
            />

            {isGoogleProvider(provider) && (
              <VisibilitySetting
                labelId={labelId}
                visible={label.labelListVisibility !== "labelHide"}
                mutateLabels={mutate}
              />
            )}

            <FolderRuleSetting
              key={`rule-${labelId}`}
              labelId={labelId}
              labelName={label.name}
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

function IconSetting({
  emailAccountId,
  labelId,
  labelName,
  dbLabel,
  mutateDbLabels,
}: {
  emailAccountId: string;
  labelId: string;
  labelName: string;
  dbLabel: UserLabelsResponse[number] | undefined;
  mutateDbLabels: () => void;
}) {
  const [selected, setSelected] = useState(dbLabel?.icon ?? "tag");

  const { execute, isExecuting } = useAction(
    updateLabelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder icon updated" });
        mutateDbLabels();
      },
      onError: (error) => {
        setSelected(dbLabel?.icon ?? "tag");
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div>
      <Label>Icon</Label>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown next to this folder in the sidebar — handy when the sidebar is
        collapsed.
      </p>
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {Object.entries(LABEL_ICONS).map(([name, Icon]) => (
          <button
            key={name}
            type="button"
            aria-label={`Use ${name} icon`}
            aria-pressed={selected === name}
            disabled={isExecuting}
            onClick={() => {
              setSelected(name);
              // Icon applies immediately; description/enabled reuse the
              // saved values so an unsaved AI draft isn't committed here
              execute({
                name: labelName,
                description: dbLabel?.description ?? undefined,
                enabled: dbLabel?.enabled ?? false,
                gmailLabelId: labelId,
                icon: name,
              });
            }}
            className={cn(
              "flex items-center justify-center rounded-md border border-border p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              selected === name && "border-primary bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
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
        toastError({ description: getActionErrorMessage(error.error) });
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

// The rule that files emails into this folder — the same rules engine as the
// Assistant page, scoped to this folder's LABEL action.
function FolderRuleSetting({
  labelId,
  labelName,
}: {
  labelId: string;
  labelName: string;
}) {
  const { data, isLoading, error, mutate } = useSWR<FolderRuleResponse>(
    `/api/user/rules/label/${encodeURIComponent(labelId)}`,
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <FolderRuleForm
          key={data.rule?.id ?? "new"}
          labelId={labelId}
          labelName={labelName}
          rule={data.rule}
          mutateRule={mutate}
        />
      )}
    </LoadingContent>
  );
}

function FolderRuleForm({
  labelId,
  labelName,
  rule,
  mutateRule,
}: {
  labelId: string;
  labelName: string;
  rule: FolderRuleResponse["rule"];
  mutateRule: () => void;
}) {
  const { emailAccountId } = useAccount();

  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [instructions, setInstructions] = useState(rule?.instructions ?? "");
  const [from, setFrom] = useState(rule?.from ?? "");
  const [operator, setOperator] = useState<LogicalOperator>(
    rule?.conditionalOperator ?? LogicalOperator.OR,
  );

  const isOrgManaged = !!rule?.organizationRuleId;

  const save = useAction(saveFolderRuleAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Folder filing rule saved" });
      mutateRule();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const generate = useAction(
    generateFolderInstructionsAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        if (!result.data) return;
        setInstructions(result.data.instructions);
        if (result.data.senderPatterns.length) {
          setFrom(result.data.senderPatterns.join(", "));
        }
        toastSuccess({
          description: "Draft generated from this folder — review and save",
        });
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="folder-rule-enabled">Automatic filing</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            File matching incoming emails into this folder. Uses the same rules
            as the Assistant page.
          </p>
        </div>
        <Switch
          id="folder-rule-enabled"
          checked={enabled}
          disabled={isOrgManaged}
          onCheckedChange={setEnabled}
        />
      </div>

      {isOrgManaged ? (
        <p className="text-sm text-muted-foreground">
          This folder is filed by an organization-managed rule. Edit it from the
          Assistant page.
        </p>
      ) : (
        <>
          <div>
            <Label htmlFor="folder-rule-from">Senders</Label>
            <Input
              id="folder-rule-from"
              className="mt-2"
              placeholder="@company.com, billing@stripe.com"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Emails from these addresses or domains. Separate with commas.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="folder-rule-instructions">
                Instructions for the AI
              </Label>
              <Button
                variant="outline"
                size="xs"
                loading={generate.isExecuting}
                onClick={() => generate.execute({ labelId, labelName })}
              >
                <SparklesIcon className="mr-1.5 size-3.5" />
                Generate from folder
              </Button>
            </div>
            <Textarea
              id="folder-rule-instructions"
              className="mt-2"
              rows={4}
              placeholder={`Which emails belong in "${labelName}"?`}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Generate learns from the emails already in this folder; you can
              edit before saving.
            </p>
          </div>

          {!!instructions.trim() && !!from.trim() && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="folder-rule-operator">Match</Label>
              <select
                id="folder-rule-operator"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={operator}
                onChange={(event) =>
                  setOperator(event.target.value as LogicalOperator)
                }
              >
                <option value={LogicalOperator.OR}>
                  Either senders or instructions
                </option>
                <option value={LogicalOperator.AND}>
                  Both senders and instructions
                </option>
              </select>
            </div>
          )}

          <Button
            loading={save.isExecuting}
            disabled={!instructions.trim() && !from.trim()}
            onClick={() =>
              save.execute({
                labelId,
                labelName,
                enabled,
                instructions: instructions.trim() || null,
                from: from.trim() || null,
                conditionalOperator: operator,
              })
            }
          >
            Save
          </Button>
        </>
      )}
    </div>
  );
}
