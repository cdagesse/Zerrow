"use client";

import { BugIcon, InboxIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { StatsCards } from "@/components/StatsCards";
import { MutedText } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminRuleReports } from "@/hooks/useAdminRuleReports";

const STATUS_VARIANT: Record<string, "destructive" | "secondary" | "outline"> =
  {
    OPEN: "destructive",
    REVIEWING: "secondary",
    RESOLVED: "outline",
    DISMISSED: "outline",
  };

export function AdminRuleReports() {
  const { data, isLoading, error } = useAdminRuleReports();

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <div className="space-y-4">
          <StatsCards
            stats={[
              {
                name: "Open",
                value: data.openCount.toLocaleString(),
                subvalue: "awaiting review",
                icon: <InboxIcon className="h-4 w-4" />,
              },
              {
                name: "Suspected bugs",
                value: data.suspectedBugCount.toLocaleString(),
                subvalue: "need a code fix",
                icon: <BugIcon className="h-4 w-4" />,
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Reported routings</CardTitle>
            </CardHeader>
            <CardContent>
              {data.reports.length === 0 ? (
                <MutedText>
                  No reports yet. These are created when a user tells the
                  assistant an email went to the wrong rule.
                </MutedText>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Went to</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {report.emailAccount?.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {report.sender || "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          {report.subject ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {report.actualRule?.name ?? (
                            <MutedText>no match</MutedText>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {report.expectedRule?.name ?? (
                            <MutedText>unspecified</MutedText>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={
                                STATUS_VARIANT[report.status] ?? "outline"
                              }
                            >
                              {report.status.toLowerCase()}
                            </Badge>
                            {report.suspectedBug && (
                              <Badge variant="destructive">bug?</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </LoadingContent>
  );
}
