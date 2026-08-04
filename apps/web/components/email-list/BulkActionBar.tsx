"use client";

import {
  ArchiveIcon,
  FolderInputIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { useQueueState } from "@/store/archive-queue";

// Floating bar that appears at the bottom of the mail list while rows are
// selected — the one home for every bulk action.
export function BulkActionBar({
  count,
  isProcessing,
  onProcessAi,
  onMoveToFolder,
  onArchive,
  onDelete,
  onClear,
}: {
  count: number;
  isProcessing: boolean;
  onProcessAi: () => void;
  onMoveToFolder: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const { activeThreads } = useQueueState();
  // Archive and Delete only enqueue work and return, and the selection isn't
  // cleared until the queue reports back. Without waiting on the queue a second
  // click enqueues the same action twice, or an Archive and then a Delete for
  // the same threads. Queue keys are `${actionType}-${threadId}`; mark-read runs
  // on every thread the user opens and can't conflict, so it doesn't block.
  const hasQueuedThreadAction = Object.keys(activeThreads || {}).some(
    (key) => key.startsWith("archive-") || key.startsWith("delete-"),
  );
  const isBusy = isProcessing || hasQueuedThreadAction;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-primary-foreground shadow-2xl">
        <span className="px-1 text-sm font-medium tabular-nums">
          {count} selected
        </span>
        <BarButton
          onClick={onProcessAi}
          disabled={isBusy}
          label={isProcessing ? "Processing…" : "Process with AI"}
        >
          {isProcessing ? (
            <ButtonLoader />
          ) : (
            <SparklesIcon className="size-4 sm:mr-1.5" />
          )}
        </BarButton>
        <BarButton
          onClick={onMoveToFolder}
          disabled={isBusy}
          label="Move to folder & train"
        >
          <FolderInputIcon className="size-4 sm:mr-1.5" />
        </BarButton>
        <BarButton onClick={onArchive} disabled={isBusy} label="Archive">
          <ArchiveIcon className="size-4 sm:mr-1.5" />
        </BarButton>
        <BarButton onClick={onDelete} disabled={isBusy} label="Delete">
          <Trash2Icon className="size-4 sm:mr-1.5" />
        </BarButton>
        {/* Clearing only drops the local selection, so it stays available
            while queued archive/delete work finishes */}
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
          onClick={onClear}
          disabled={isProcessing}
          aria-label="Clear selection"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function BarButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Button>
  );
}
