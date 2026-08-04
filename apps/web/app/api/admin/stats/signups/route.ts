import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";
import { buildDailySeries, type DayCount } from "../daily-series";
import type { AdminStatsParams } from "../types";
import { createAdminStatsRoute, resolveDateRange } from "../utils";

export type GetAdminSignupsResponse = Awaited<ReturnType<typeof getSignups>>;

export const GET = createAdminStatsRoute("admin/stats/signups", getSignups);

async function getSignups(params: AdminStatsParams) {
  const { from, to } = resolveDateRange(params);

  // to_char rather than a bare date_trunc so the day crosses the wire as an
  // unambiguous UTC "YYYY-MM-DD" string. A timestamp would be re-read in the
  // server's local zone and land on the wrong day west of UTC.
  const [users, mailboxes] = await Promise.all([
    prisma.$queryRaw<DayCount[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<DayCount[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM "EmailAccount"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  // "All time" sends no lower bound, so `from` is the epoch, and a dense series
  // from there is twenty thousand zero-filled days ahead of the product's first
  // signup: a huge response, and a chart whose bars vanish beside all that empty
  // history. The first day holding a signup is the honest left edge there. A
  // bound the caller did pick is kept as-is, so a quiet week still reads as
  // zeroes instead of silently narrowing to the days that have data.
  const seriesFrom = isDefined(params.fromDate)
    ? from
    : firstDayWithSignup(users, mailboxes);

  return {
    result: seriesFrom
      ? buildDailySeries({ from: seriesFrom, to, users, mailboxes })
      : [],
  };
}

/** Earliest UTC day holding a signup, or null when the window holds none. */
function firstDayWithSignup(users: DayCount[], mailboxes: DayCount[]) {
  // Both queries order by day, so only each series' first row can be earliest,
  // and `YYYY-MM-DD` compares chronologically as a string.
  const firstDays = [users[0]?.day, mailboxes[0]?.day].filter(isDefined).sort();
  const earliest = firstDays[0];

  return earliest ? new Date(`${earliest}T00:00:00.000Z`) : null;
}
