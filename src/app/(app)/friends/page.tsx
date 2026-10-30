import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FriendsView } from "@/components/friends/FriendsView";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const t = await getT();

  return (
    <>
      <PageHeader title={t("page.friends.title")} description={t("page.friends.description")} />
      <FriendsView />
    </>
  );
}
