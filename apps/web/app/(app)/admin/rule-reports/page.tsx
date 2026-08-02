import { AdminRuleReports } from "@/app/(app)/admin/rule-reports/AdminRuleReports";
import { ErrorPage } from "@/components/ErrorPage";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";

export default async function AdminRuleReportsPage() {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description="You do not have permission to access this page."
      />
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Rule reports"
        description="Emails users reported as routed wrong. Suspected bugs are outcomes the rule's own operator makes impossible — those need a code fix, not a rule change."
      />
      <div className="mt-4 mb-20">
        <AdminRuleReports />
      </div>
    </PageWrapper>
  );
}
