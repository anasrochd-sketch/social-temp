import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AssignmentsBoard } from "@/components/learning/AssignmentsBoard";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("assignments.title") };
}

export default async function AssignmentsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader
        title={t("assignments.title")}
        description={t("assignments.description")}
      />
      <AssignmentsBoard />
    </>
  );
}
