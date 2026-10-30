import type { Metadata } from "next";
import { CodingLab } from "@/components/coding/CodingLab";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.coding") };
}

export default async function CodingPage({ searchParams }: { searchParams: Promise<{ assignmentId?: string; assignmentTitle?: string }> }) {
  const params = await searchParams;
  return (
    <CodingLab assignmentId={params.assignmentId} assignmentTitle={params.assignmentTitle} />
  );
}
