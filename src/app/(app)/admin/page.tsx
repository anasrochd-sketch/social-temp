import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.title")} description={t("admin.desc")} />
      <AdminDashboard />
    </>
  );
}
