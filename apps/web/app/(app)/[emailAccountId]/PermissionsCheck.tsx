"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkPermissionsAction } from "@/utils/actions/permissions";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useOrgAccess } from "@/hooks/useOrgAccess";

const permissionsChecked: Record<string, boolean> = {};

export function PermissionsCheck() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { isAccountOwner } = useOrgAccess();

  useEffect(() => {
    // Skip permissions check when viewing another user's account (non-owner)
    if (!isAccountOwner) return;

    if (permissionsChecked[emailAccountId]) return;
    permissionsChecked[emailAccountId] = true;

    // Delay past first paint so this server action doesn't contend with the
    // thread list request on cold serverless starts
    let checked = false;
    const timeout = setTimeout(() => {
      checked = true;
      checkPermissionsAction(emailAccountId).then((result) => {
        if (
          result?.data?.hasAllPermissions === false ||
          result?.data?.hasRefreshToken === false
        ) {
          router.replace(prefixPath(emailAccountId, "/permissions/consent"));
        }
      });
    }, 3000);

    return () => {
      clearTimeout(timeout);
      // let a remount re-attempt if we never actually checked
      if (!checked) permissionsChecked[emailAccountId] = false;
    };
  }, [router, emailAccountId, isAccountOwner]);

  return null;
}
