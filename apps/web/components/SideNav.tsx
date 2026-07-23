"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import type { LabelCountsResponse } from "@/app/api/labels/counts/route";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import { getLabelIcon } from "@/utils/label-icons";
import { getEmailTerminology } from "@/utils/terminology";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  InboxIcon,
  type LucideIcon,
  PenIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupLabel,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupContent,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SetupProgressCard } from "@/components/SetupProgressCard";
import { SideNavMenu } from "@/components/SideNavMenu";
import { CommandShortcut } from "@/components/ui/command";
import { useSplitLabels } from "@/hooks/useLabels";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { NavUser } from "@/components/NavUser";
import { PremiumCard } from "@/components/PremiumCard";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | (() => React.ReactNode);
  target?: "_blank";
  count?: number;
  active?: boolean;
  beta?: boolean;
  new?: boolean;
};

const mailFolders = [
  { name: "Inbox", icon: InboxIcon, type: "inbox" },
  { name: "Drafts", icon: FileIcon, type: "draft" },
  { name: "Sent", icon: SendIcon, type: "sent" },
  { name: "Archived", icon: ArchiveIcon, type: "archive" },
];

export function SideNav({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const path = usePathname();
  const { data: user } = useUser();

  const bottomItems: NavItem[] = useMemo(
    () => [
      {
        name: "Settings",
        href: "/settings",
        icon: SettingsIcon,
      },
      ...(user?.isAdmin
        ? [
            {
              name: "Admin",
              href: "/admin",
              icon: ShieldIcon,
            },
          ]
        : []),
    ],
    [user?.isAdmin],
  );

  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-0 pb-0">
        {state.includes("left-sidebar") ? (
          <div className="flex items-center rounded-md pl-2 pr-0.5 py-3 text-foreground justify-between">
            <Link href="/mail">
              <Logo className="h-3.5" />
            </Link>
            <SidebarTrigger name="left-sidebar" />
          </div>
        ) : (
          <div className="pb-2">
            <SidebarTrigger name="left-sidebar" />
          </div>
        )}
        <AccountSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {state.includes("left-sidebar") ? <SetupProgressCard /> : null}

        <SidebarGroupContent>
          <MailNav path={path} />

          <SidebarGroup>
            <SideNavMenu items={bottomItems} activeHref={path} />
          </SidebarGroup>
        </SidebarGroupContent>
      </SidebarContent>

      <PremiumCard isCollapsed={!state.includes("left-sidebar")} />

      <SidebarFooter className="pb-4">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

function MailNav({ path }: { path: string }) {
  const { onOpen } = useComposeModal();
  const [showHiddenLabels, setShowHiddenLabels] = useState(false);
  const { visibleLabels, hiddenLabels, isLoading } = useSplitLabels();
  const { emailAccountId, provider } = useAccount();
  const searchParams = useSearchParams();
  const terminology = getEmailTerminology(provider);
  const { data: countsData } = useSWR<LabelCountsResponse>(
    "/api/labels/counts",
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const counts = countsData?.counts;

  const { data: dbLabels } = useSWR<UserLabelsResponse>("/api/user/labels");
  const iconByGmailLabelId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dbLabel of dbLabels ?? []) {
      if (dbLabel.icon) map[dbLabel.gmailLabelId] = dbLabel.icon;
    }
    return map;
  }, [dbLabels]);

  const isMailPage = path.includes("/mail");
  const currentType = searchParams.get("type");
  const currentLabelId = searchParams.get("labelId");
  const mailPath = prefixPath(emailAccountId, "/mail");

  const folderItems = useMemo(
    () =>
      mailFolders.map((folder) => ({
        name: folder.name,
        icon: folder.icon,
        href: `${mailPath}?type=${folder.type}`,
        count: folder.type === "inbox" ? counts?.INBOX : undefined,
        active:
          isMailPage &&
          (currentType === folder.type ||
            (folder.type === "inbox" && !currentType)),
      })),
    [mailPath, isMailPage, currentType, counts],
  );

  const toLabelNavItem = (label: {
    id?: string | null;
    name?: string | null;
  }) => ({
    name: label.name ?? "",
    icon: getLabelIcon(label.id ? iconByGmailLabelId[label.id] : undefined),
    href: `${mailPath}?type=label&labelId=${encodeURIComponent(label.id ?? "")}`,
    count: label.id ? counts?.[label.id] : undefined,
    active:
      isMailPage && currentType === "label" && currentLabelId === label.id,
  });

  const labelNavItems = visibleLabels.map(toLabelNavItem);
  const hiddenLabelNavItems = hiddenLabels.map(toLabelNavItem);

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-9 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              onClick={onOpen}
              sidebarName="left-sidebar"
            >
              <PenIcon className="size-4" />
              <span className="truncate font-semibold">Compose</span>
              <CommandShortcut>C</CommandShortcut>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SideNavMenu items={folderItems} activeHref={path} />
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>
          {terminology.label.pluralCapitalized}
        </SidebarGroupLabel>
        <LoadingContent loading={isLoading}>
          {visibleLabels.length > 0 ? (
            <SideNavMenu items={labelNavItems} activeHref={path} />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No {terminology.label.plural}
            </div>
          )}

          {/* Hidden labels toggle */}
          {hiddenLabels.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowHiddenLabels(!showHiddenLabels)}
                className="flex w-full items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {showHiddenLabels ? (
                  <ChevronDownIcon className="mr-1 size-4" />
                ) : (
                  <ChevronRightIcon className="mr-1 size-4" />
                )}
                <span>More</span>
              </button>

              {showHiddenLabels && (
                <SideNavMenu items={hiddenLabelNavItems} activeHref={path} />
              )}
            </>
          )}
        </LoadingContent>
      </SidebarGroup>
    </>
  );
}
