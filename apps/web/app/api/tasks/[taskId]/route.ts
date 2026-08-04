import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type TaskEmailsResponse = NonNullable<
  Awaited<ReturnType<typeof getTaskEmails>>
>;

// One task's linked emails, for the task drawer's Emails and Attachments tabs.
// Split out of the tasks list because that list is warmed on every app
// navigation and must stay bounded no matter how much mail a task accumulates.
export const GET = withEmailAccount(
  "tasks/emails",
  async (request, { params }) => {
    const { emailAccountId } = request.auth;
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required." },
        { status: 400 },
      );
    }

    const task = await getTaskEmails({ taskId, emailAccountId });

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json(task);
  },
);

async function getTaskEmails({
  taskId,
  emailAccountId,
}: {
  taskId: string;
  emailAccountId: string;
}) {
  // emailAccountId is part of the filter, not checked after the fact, so a task
  // belonging to another account reads as not found rather than leaking mail
  return prisma.task.findFirst({
    where: { id: taskId, emailAccountId },
    select: {
      id: true,
      emails: { orderBy: { createdAt: "desc" } },
    },
  });
}
