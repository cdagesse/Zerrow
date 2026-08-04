import { SafeError } from "@/utils/error";
import { withAdmin } from "@/utils/middleware";
import { type AdminStatsParams, adminStatsParams } from "./types";

/**
 * Admin analogue of createOrgStatsRoute: same param parsing, but gated by
 * withAdmin and with no organization to resolve.
 */
export function createAdminStatsRoute<T>(
  routeName: string,
  getData: (params: AdminStatsParams) => Promise<T>,
) {
  return withAdmin(routeName, async (request) => {
    const { searchParams } = new URL(request.url);
    const queryParams = adminStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    return Response.json(
      await getData({
        fromDate: queryParams.fromDate ?? undefined,
        toDate: queryParams.toDate ?? undefined,
      }),
    );
  });
}

/**
 * Inclusive window. An absent bound means unbounded, not a default window:
 * the date picker sends no dates for "All time", and quietly substituting 30
 * days there would label a month as all time.
 *
 * Both bounds are caller-supplied epoch millis, so they are clamped to the only
 * span that can contain a signup — the epoch to now. Left alone, a far-future
 * `toDate` has the signups route generate one chart point per day up to that
 * date, so a single request can allocate and format hundreds of millions of
 * them. An inverted range is rejected rather than swapped or emptied, so a
 * mistyped window cannot read as a legitimate answer.
 */
export function resolveDateRange({ fromDate, toDate }: AdminStatsParams) {
  const now = Date.now();
  // Nullish, not falsy: 0 is a valid bound meaning the epoch itself.
  const from = clampToNow(fromDate ?? 0, now);
  const to = clampToNow(toDate ?? now, now);

  if (from > to) {
    throw new SafeError("fromDate must not be after toDate", 400);
  }

  return { from: new Date(from), to: new Date(to) };
}

function clampToNow(time: number, now: number) {
  return Math.min(Math.max(time, 0), now);
}
