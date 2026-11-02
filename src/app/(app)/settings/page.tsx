import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.desc")} />
      <SettingsForm />
    </>
  );
}
