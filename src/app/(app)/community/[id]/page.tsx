
import type { Metadata } from "next";
import { CommunityDetail } from "@/components/community/CommunityDetail";

export const metadata: Metadata = {
  title: "Community",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CommunityPage({ params }: PageProps) {
  const { id } = await params;

  return <CommunityDetail communityId={id} />;
}
