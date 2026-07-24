import { Skeleton } from "@/components/ui/skeleton";

// Placeholder rows shown while the thread list loads, shaped like EmailListItem
export function EmailListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-4 w-32 shrink-0 md:w-48" />
          <Skeleton className="hidden h-4 min-w-0 flex-1 md:block" />
          <Skeleton className="ml-auto h-4 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
