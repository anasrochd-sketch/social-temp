import type { Metadata } from "next";
import { AssignmentDetailView } from "@/components/learning/AssignmentDetailView";
import { getT } from "@/i18n/server";

type AssignmentPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("assignments.title") };
}

export default async function AssignmentPage({ params }: AssignmentPageProps) {
  const { id } = await params;
  return <AssignmentDetailView assignmentId={id} />;
}
