import type { Metadata } from "next";
import { ResourceDetailView } from "@/components/learning/ResourceDetailView";
import { getT } from "@/i18n/server";

type ResourcePageProps = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("resources.detailTitle") };
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { id } = await params;
  return <ResourceDetailView resourceId={id} />;
}
