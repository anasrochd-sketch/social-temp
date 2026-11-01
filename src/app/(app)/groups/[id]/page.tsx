import type { Metadata } from "next";
import { GroupDetail } from "@/components/groups/GroupDetail";

export const metadata: Metadata = { title: "Group" };

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const [{ id }, { join }] = await Promise.all([params, searchParams]);
  return <GroupDetail code={id} joinParam={join ?? ""} />;
}
