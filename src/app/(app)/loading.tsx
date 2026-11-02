import { getT } from "@/i18n/server";

import { CardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default async function Loading() {
  const t = await getT();
  return (
    <div>
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-8 h-4 w-80" />
      <CardGridSkeleton label={t("common.loading")} />
    </div>
  );
}
