import type { Metadata } from "next";
import { GroupsBrowser } from "@/components/groups/GroupsBrowser";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const { join } = await searchParams;
  return <GroupsBrowser initialJoinCode={join ?? ""} />;
}
