"use client";

import { useEffect, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useSWRConfig } from "swr";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createGroupAction } from "@/utils/actions/group";
import { learnPatternsFromHistoryAction } from "@/utils/actions/learn-patterns";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { Skeleton } from "@/components/ui/skeleton";

export function LearnedPatternsDialog({
  ruleId,
  groupId,
  disabled,
  label = "View learned patterns",
}: {
  ruleId: string;
  groupId: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const { emailAccountId } = useAccount();

  const [learnedPatternGroupId, setLearnedPatternGroupId] = useState<
    string | null
  >(groupId);

  const { execute, isExecuting } = useAction(
    createGroupAction.bind(null, emailAccountId),
    {
      onSuccess: (data) => {
        if (data.data?.groupId) {
          setLearnedPatternGroupId(data.data.groupId);
        } else {
          toastError({
            description: "There was an error setting up learned patterns.",
          });
        }
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={async () => {
            if (!ruleId) return;
            if (groupId) return;
            if (isExecuting) return;

            execute({ ruleId });
          }}
        >
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="top-4 max-h-[calc(100dvh-2rem)] max-w-2xl translate-y-0 overflow-y-auto p-4 sm:top-[50%] sm:max-h-[90dvh] sm:translate-y-[-50%] sm:p-6">
        <DialogHeader>
          <DialogTitle>Learned patterns</DialogTitle>
          <DialogDescription>
            Learned patterns are patterns that the AI has learned from your
            email history. When a learned pattern is matched other rules
            conditions are skipped and this rule is automatically selected.
          </DialogDescription>
        </DialogHeader>

        {isExecuting ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          learnedPatternGroupId && (
            <ViewLearnedPatterns groupId={learnedPatternGroupId} />
          )
        )}

        {/* Learning creates the rule's group server-side if it has none, so
            it must wait for the group setup above — two concurrent creates
            leave this dialog without the group it renders */}
        <LearnFromHistory
          ruleId={ruleId}
          groupId={learnedPatternGroupId}
          disabled={isExecuting}
        />
      </DialogContent>
    </Dialog>
  );
}

const PATTERN_POLL_INTERVAL_MS = 5000;
// Matches the "within a few minutes" the toast promises
const PATTERN_POLL_WINDOW_MS = 3 * 60 * 1000;

// Patterns normally accrue only as new AI-matched mail arrives; this mines
// the mail this rule has already been applied to, on demand
function LearnFromHistory({
  ruleId,
  groupId,
  disabled,
}: {
  ruleId: string;
  groupId: string | null;
  disabled?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const { mutate } = useSWRConfig();
  const [pollUntil, setPollUntil] = useState<number | null>(null);
  // The key ViewLearnedPatterns reads
  const patternsKey = groupId ? `/api/user/group/${groupId}/items` : null;

  // Queued senders are analyzed in the background, so the list above only
  // shows what landed before it last loaded. Re-check for as long as the
  // toast says patterns may still appear.
  useEffect(() => {
    if (!(patternsKey && pollUntil)) return;

    const interval = setInterval(() => {
      if (Date.now() >= pollUntil) {
        setPollUntil(null);
        return;
      }
      mutate(patternsKey);
    }, PATTERN_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [patternsKey, pollUntil, mutate]);

  const learn = useAction(
    learnPatternsFromHistoryAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        if (!result.data) return;
        const { candidates, queued } = result.data;
        if (queued) {
          if (patternsKey) mutate(patternsKey);
          setPollUntil(Date.now() + PATTERN_POLL_WINDOW_MS);
        }
        toastSuccess({
          description: candidates
            ? `Analyzing ${queued} sender${queued === 1 ? "" : "s"} from this rule's history — patterns that qualify appear here within a few minutes.`
            : "No senders qualify yet — a sender needs at least 3 emails this rule was consistently applied to.",
        });
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Patterns are learned as new mail matches this rule with AI. You can also
        learn from mail it already handled.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-auto"
        loading={learn.isExecuting}
        disabled={disabled}
        onClick={() => learn.execute({ ruleId })}
      >
        Learn from history
      </Button>
    </div>
  );
}
