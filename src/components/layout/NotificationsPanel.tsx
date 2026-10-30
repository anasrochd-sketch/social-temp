"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useT } from "@/i18n/client";
import { notificationSentence } from "@/lib/notifications";
import { formatWhen, socialActions, useSocial } from "@/lib/social-store";
import { useOutsideClose } from "@/lib/use-outside-close";
import { cn } from "@/lib/utils";

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, open, close);

  const t = useT();
  const social = useSocial();
  const notifications = social.notifications;
  const unread = notifications.filter((n) => n.readAt === null);
  const unreadCount = unread.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          unreadCount > 0 ? t("notif.unread", { count: unreadCount }) : t("notif.title")
        }
        className="relative rounded-lg p-2 text-cova-ink hover:bg-cova-pale"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-cova-muted" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-cova-line bg-white">
          <div className="flex items-center justify-between border-b border-cova-line px-4 py-3">
            <h2 className="text-sm font-semibold">{t("notif.title")}</h2>
            <button
              type="button"
              disabled={unreadCount === 0 || !social.meId}
              onClick={() => {
                if (social.meId) void socialActions.markAllNotificationsRead(social.meId);
              }}
              className="text-xs font-medium text-cova-ink underline-offset-2 hover:underline disabled:text-cova-mute disabled:no-underline"
            >
              {t("notif.markAll")}
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-cova-line overflow-y-auto">
            {notifications.slice(0, 5).map((n) => {
              const isUnread = n.readAt === null;
              return (
                <li key={n.id}>
                  <Link
                    href={n.href ?? "/notifications"}
                    onClick={() => {
                      if (isUnread && social.meId) {
                        void socialActions.markNotificationRead(social.meId, n.id);
                      }
                      setOpen(false);
                    }}
                    className={cn("block px-4 py-3 hover:bg-cova-bg", isUnread && "bg-cova-pale/50")}
                  >
                    <p className="text-sm font-medium text-cova-ink">
                      {notificationSentence(n, social.users, t)}
                    </p>
                    <p className="mt-1 text-xs text-cova-mute">{formatWhen(n.at)}</p>
                  </Link>
                </li>
              );
            })}
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-cova-mute">
                {social.ready ? t("notif.empty") : t("notif.signin")}
              </li>
            )}
          </ul>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-cova-line px-4 py-3 text-center text-sm font-medium text-cova-ink hover:bg-cova-bg"
          >
            {t("notif.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
