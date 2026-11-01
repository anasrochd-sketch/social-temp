import type { Metadata } from "next";
import { CommunityDetail } from "@/components/community/CommunityDetail";

export const metadata: Metadata = {
  title: "Community",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ join?: string }>;
}

export default async function CommunityPage({ params, searchParams }: PageProps) {
  const [{ id }, { join }] = await Promise.all([params, searchParams]);

  return <CommunityDetail communityId={id} joinParam={join ?? ""} />;
}
