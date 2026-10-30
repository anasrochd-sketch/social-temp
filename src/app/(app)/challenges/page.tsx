import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChallengesBoard } from "@/components/learning/ChallengesBoard";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.challenges") };
}

export default async function ChallengesPage() {
  const t = await getT();
  return (
    <>
      <PageHeader
        title={t("nav.challenges")}
        description={t("challenges.pageDescription")}
      />
      <ChallengesBoard />
    </>
  );
}
