"use client";

import Link from "next/link";
import {
  ArchiveIcon,
  BanIcon,
  BarChartBigIcon,
  BrushIcon,
  CalendarIcon,
  FileTextIcon,
  HardDriveIcon,
  MailCheckIcon,
  MailsIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { ItemCard } from "@/components/ui/item";
import {
  useCleanerEnabled,
  useIntegrationsEnabled,
  useMeetingBriefsEnabled,
} from "@/hooks/useFeatureFlags";

// Bare paths: app/(redirects)/<path> resolves the active email account,
// so these work from the account-agnostic global settings page.
export function FeaturesSection() {
  const showCleaner = useCleanerEnabled();
  const showMeetingBriefs = useMeetingBriefsEnabled();
  const showIntegrations = useIntegrationsEnabled();

  const features = [
    {
      name: "Chat",
      description: "Manage your inbox by chatting with your AI assistant",
      href: "/assistant",
      icon: MessageSquareIcon,
    },
    {
      name: "AI Assistant",
      description: "Set rules for how your email is organized and answered",
      href: "/automation",
      icon: SparklesIcon,
    },
    {
      name: "Channels",
      description: "Connect Slack, Teams, or Telegram to your assistant",
      href: "/channels",
      icon: MessagesSquareIcon,
    },
    {
      name: "Bulk Unsubscribe",
      description: "Unsubscribe and archive newsletters you never read",
      href: "/bulk-unsubscribe",
      icon: MailsIcon,
    },
    {
      name: "Bulk Archive",
      description: "Clean up your inbox by archiving old emails",
      href: "/bulk-archive",
      icon: ArchiveIcon,
    },
    {
      name: "Analytics",
      description: "Track your email activity and trends",
      href: "/stats",
      icon: BarChartBigIcon,
    },
    ...(showCleaner
      ? [
          {
            name: "Deep Clean",
            description: "Clean up thousands of emails with AI",
            href: "/clean",
            icon: BrushIcon,
          },
        ]
      : []),
    {
      name: "Calendars",
      description: "Connect calendars for scheduling context",
      href: "/calendars",
      icon: CalendarIcon,
    },
    ...(showMeetingBriefs
      ? [
          {
            name: "Meeting Briefs",
            description: "Personalized briefings before every meeting",
            href: "/briefs",
            icon: FileTextIcon,
          },
        ]
      : []),
    {
      name: "Attachments",
      description: "Automatically file attachments to cloud storage",
      href: "/drive",
      icon: HardDriveIcon,
    },
    ...(showIntegrations
      ? [
          {
            name: "Integrations",
            description: "Connect external tools to your assistant",
            href: "/integrations",
            icon: ZapIcon,
          },
        ]
      : []),
    {
      name: "Reply Zero",
      description: "Track emails needing replies and awaiting responses",
      href: "/reply-zero",
      icon: MailCheckIcon,
    },
    {
      name: "Cold Email Blocker",
      description: "Automatically block unsolicited cold emails",
      href: "/cold-email-blocker",
      icon: BanIcon,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => (
        <Link key={feature.href} href={feature.href}>
          <ItemCard className="flex h-full items-start gap-3 p-4 transition-colors hover:bg-accent">
            <feature.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">{feature.name}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </ItemCard>
        </Link>
      ))}
    </div>
  );
}
