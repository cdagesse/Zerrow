import { NextResponse } from "next/server";
import { withAdmin } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const LIMIT = 100;

export type GetAdminRuleReportsResponse = Awaited<
  ReturnType<typeof getRuleReports>
>;

export const GET = withAdmin("admin/rule-reports", async () =>
  NextResponse.json(await getRuleReports()),
);

async function getRuleReports() {
  const [reports, openCount, suspectedBugCount] = await Promise.all([
    prisma.ruleMisfireReport.findMany({
      take: LIMIT,
      // Suspected bugs first: they need a code fix, so they age worse than a
      // misconfiguration the user can correct themselves.
      orderBy: [
        { suspectedBug: "desc" },
        { status: "asc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        createdAt: true,
        messageId: true,
        sender: true,
        subject: true,
        suspectedBug: true,
        status: true,
        reviewNote: true,
        actualRule: { select: { name: true } },
        expectedRule: { select: { name: true } },
        emailAccount: { select: { email: true } },
      },
    }),
    prisma.ruleMisfireReport.count({ where: { status: "OPEN" } }),
    prisma.ruleMisfireReport.count({
      where: { suspectedBug: true, status: { in: ["OPEN", "REVIEWING"] } },
    }),
  ]);

  return { reports, openCount, suspectedBugCount };
}
