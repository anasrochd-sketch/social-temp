import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ResourcesBrowser } from "@/components/learning/ResourcesBrowser";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("resources.title") };
}

export default async function ResourcesPage() {
  const t = await getT();
  return (
    <>
      <PageHeader
        title={t("resources.title")}
        description={t("resources.description")}
      />
      <ResourcesBrowser />
    </>
  );
}
