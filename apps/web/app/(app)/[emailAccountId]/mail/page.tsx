"use client";

import { useCallback, useEffect, useState, use } from "react";
import useSWRInfinite from "swr/infinite";
import { useSetAtom } from "jotai";
import { SearchIcon, XIcon } from "lucide-react";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { refetchEmailListAtom } from "@/store/email";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { createSearchParams } from "@/utils/url";

export default function Mail(props: {
  searchParams: Promise<{ type?: string; labelId?: string }>;
}) {
  const searchParams = use(props.searchParams);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce typing so we don't fire a request per keystroke
  useEffect(() => {
    const timeout = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // A stale query would silently filter the new folder; clear it on switch
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset when the folder changes
  useEffect(() => {
    setSearchInput("");
    setSearchQuery("");
  }, [searchParams.type, searchParams.labelId]);

  const getKey = (
    pageIndex: number,
    previousPageData: ThreadsResponse | null,
  ) => {
    if (previousPageData && !previousPageData.nextPageToken) return null;

    const query: ThreadsQuery = {};

    if (searchQuery) query.q = searchQuery;

    // Handle different query params
    if (searchParams.type === "label" && searchParams.labelId) {
      query.labelId = searchParams.labelId;
    } else if (searchParams.type) {
      query.type = searchParams.type;
    }

    // Append nextPageToken for subsequent pages
    if (pageIndex > 0 && previousPageData?.nextPageToken) {
      query.nextPageToken = previousPageData.nextPageToken;
    }
    const queryParams = createSearchParams(query);

    return `/api/threads?${queryParams.toString()}`;
  };

  // No keepPreviousData: switching folders should show a loader rather than
  // the previous folder's emails; revisited folders load instantly from cache.
  // Focus revalidation + a 30s poll of the first page keep new mail appearing
  // without a manual reload.
  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsResponse>(getKey, {
      dedupingInterval: 1000,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      refreshInterval: 30_000,
    });

  const allThreads = data ? data.flatMap((page) => page.threads) : [];
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const showLoadMore = data ? !!data[data.length - 1]?.nextPageToken : false;

  // store `refetch` in the atom so we can refresh the list upon archive via command k
  // TODO is this the best way to do this?
  const refetch = useCallback(
    (options?: { removedThreadIds?: string[] }) => {
      // Without removedThreadIds there is nothing to optimistically update;
      // revalidate so changes like undo actually show up.
      if (!options?.removedThreadIds) {
        mutate();
        return;
      }

      mutate(
        (currentData) => {
          if (!currentData) return currentData;
          if (!options?.removedThreadIds) return currentData;

          return currentData.map((page) => ({
            ...page,
            threads: page.threads.filter(
              (t) => !options?.removedThreadIds?.includes(t.id),
            ),
          }));
        },
        {
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
    },
    [mutate],
  );

  // Set up the refetch function in the atom store
  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

  const handleLoadMore = useCallback(() => {
    setSize((size) => size + 1);
  }, [setSize]);

  return (
    // Pin the mail view to the visible screen with internal list scrolling.
    // On mobile use fixed positioning (tracks the real visual viewport even
    // under iOS Safari page zoom, where svh/vh units over-report height);
    // on desktop a viewport-unit height is reliable and respects the sidebar.
    <div className="flex flex-col overflow-hidden max-md:fixed max-md:inset-x-0 max-md:top-9 max-md:bottom-0 md:h-[calc(100svh-2.25rem)]">
      <PermissionsCheck />
      <div className="relative border-b border-border px-4 py-1.5">
        <SearchIcon className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search emails"
          className="h-8 w-full rounded-md border-0 bg-muted pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {searchInput && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchInput("")}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      <LoadingContent loading={isLoading && !data} error={error}>
        {allThreads && (
          <List
            emails={allThreads}
            refetch={refetch}
            type={searchParams.type}
            labelId={searchParams.labelId}
            showLoadMore={showLoadMore}
            handleLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
          />
        )}
      </LoadingContent>
    </div>
  );
}
