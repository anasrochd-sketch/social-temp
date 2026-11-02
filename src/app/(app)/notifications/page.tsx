import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationsList } from "@/components/learning/NotificationsList";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.desc")} />
      <NotificationsList />
    </>
  );
}
