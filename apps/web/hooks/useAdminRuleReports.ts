import useSWR from "swr";
import type { GetAdminRuleReportsResponse } from "@/app/api/admin/rule-reports/route";

export function useAdminRuleReports() {
  return useSWR<GetAdminRuleReportsResponse>("/api/admin/rule-reports");
}
