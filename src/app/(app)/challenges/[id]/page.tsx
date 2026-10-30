import type { Metadata } from "next";
import { ChallengeDetailView } from "@/components/learning/ChallengeDetailView";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.challenges") };
}

export default async function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeDetailView challengeId={id} />;
}
