"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { CoursesBrowser } from "@/components/learning/CoursesBrowser";
import { CourseManager } from "@/components/learning/CourseManager";
import { JoinCourse } from "@/components/learning/JoinCourse";
import { useT } from "@/i18n/client";

export function CoursesPageContent() {
  const t = useT();

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title={t("courses.title")}
        description={t("courses.pageDescription")}
      />

      <div className="grid w-full min-w-0 grid-cols-2 items-start gap-3">
        <section className="w-full min-w-0 flex-1 [&>*]:w-full">
          <CourseManager />
        </section>
        <section className="w-full min-w-0 flex-1 [&>*]:w-full">
          <JoinCourse />
        </section>
      </div>

      <div className="mt-6 min-w-0">
        <CoursesBrowser />
      </div>
    </div>
  );
}
