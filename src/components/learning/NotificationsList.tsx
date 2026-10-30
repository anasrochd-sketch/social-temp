"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Award,
  Bell,
  BellOff,
  BookOpen,
  Check,
  ClipboardCheck,
  ClipboardList,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useT } from "@/i18n/client";
import { notificationSentence } from "@/lib/notifications";
import { formatWhen, socialActions, useSocial } from "@/lib/social-store";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<string, LucideIcon> = {
  friend_request: UserPlus,
  friend_accepted: UserCheck,
  join_request: Users,
  join_request_approved: Check,
  join_request_denied: X,
  member_joined: Users,
  member_removed: UserPlus,
  role_changed: Shield,
  assignment_created: ClipboardList,
  assignment_graded: ClipboardCheck,
  xp_earned: Award,
  resource_added: BookOpen,
};

export function NotificationsList() {
  const t = useT();
  const social = useSocial();
  const [tab, setTab] = useState<"all" | "unread">("all");

  if (!social.ready) {
    return (
      <Card>
        <ul className="divide-y divide-cova-line">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (!social.meId) {
    return (
      <EmptyState
        icon={BellOff}
        title={t("notif.caughtUp")}
        description={t("notif.signin")}
      />
    );
  }

  const unread = social.notifications.filter((n) => n.readAt === null);
  const rows = tab === "all" ? social.notifications : unread;
  const tabs = [t("notif.all"), t("notif.unreadTab")] as const;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Tabs
          tabs={[...tabs]}
          value={tab === "all" ? tabs[0] : tabs[1]}
          onChange={(v) => setTab(v === tabs[1] ? "unread" : "all")}
          label={t("notif.title")}
          counts={{ [t("notif.unreadTab")]: unread.length }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={unread.length === 0}
          onClick={() => void socialActions.markAllNotificationsRead(social.meId ?? "")}
        >
          {t("notif.markAll")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={t("notif.caughtUp")}
          description={t("notif.caughtUpBody")}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-cova-line">
            {rows.map((n) => {
              const Icon = KIND_ICONS[n.kind] ?? Bell;
              const isUnread = n.readAt === null;
              const sentence = notificationSentence(n, social.users, t);
              return (
                <li
                  key={n.id}
                  className={cn("flex items-start gap-4 p-4", isUnread && "bg-cova-pale/50")}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {sentence}
                      {isUnread && <span className="sr-only"> ({t("notif.unreadTab")})</span>}
                    </p>
                    <p className="mt-1 flex gap-3 text-xs text-cova-mute">
                      <span>{formatWhen(n.at)}</span>
                      {n.href && (
                        <Link
                          href={n.href}
                          onClick={() => {
                            if (isUnread) {
                              void socialActions.markNotificationRead(social.meId ?? "", n.id);
                            }
                          }}
                          className="font-medium text-cova-ink underline-offset-2 hover:underline"
                        >
                          {t("notif.open")}
                        </Link>
                      )}
                    </p>
                  </div>
                  {isUnread && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void socialActions.markNotificationRead(social.meId ?? "", n.id)}
                    >
                      {t("notif.markRead")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
