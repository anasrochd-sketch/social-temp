
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { buttonStyles } from "@/components/ui/Button";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";

type DashboardCourse = {
  id: string;
  title: string;
};

type DashboardLesson = {
  id: string;
  course_id: string;
};

export function ContinueLearning({
  enrolled,
  completedLessons,
}: {
  enrolled: string[];
  completedLessons: string[];
}) {
  const t = useT();
  const [activeCourses, setActiveCourses] = useState<DashboardCourse[]>([]);
  const [lessons, setLessons] = useState<DashboardLesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCourses() {
      setLoading(true);

      if (enrolled.length === 0) {
        setActiveCourses([]);
        setLessons([]);
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabase();

        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", enrolled);

        if (courseError) throw courseError;

        const { data: lessonData, error: lessonError } = await supabase
          .from("course_lessons")
          .select("id, course_id")
          .in("course_id", enrolled);

        if (lessonError) throw lessonError;

        if (active) {
          setActiveCourses((courseData ?? []) as DashboardCourse[]);
          setLessons((lessonData ?? []) as DashboardLesson[]);
        }
      } catch (error) {
        console.error("Erreur de chargement des cours du Dashboard :", error);

        if (active) {
          setActiveCourses([]);
          setLessons([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      active = false;
    };
  }, [enrolled]);

  const completedSet = new Set(completedLessons);

  return (
    <Card>
      <CardHeader
        title={t("dashboard.continueLearning")}
        action={
          <Link
            href="/courses"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            {t("dashboard.allCourses")}
          </Link>
        }
      />

      <CardBody>
        {loading ? (
          <p className="text-sm text-cova-mute">
            {t("dashboard.loadingCourses")}
          </p>
        ) : activeCourses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t("dashboard.noCourses")}
            description={t("dashboard.noCoursesDescription")}
            action={
              <Link href="/courses" className={buttonStyles()}>
                {t("dashboard.browseCourses")}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-5">
            {activeCourses.map((course) => {
              const courseLessons = lessons.filter(
                (lesson) => lesson.course_id === course.id,
              );

              const done = courseLessons.filter((lesson) =>
                completedSet.has(lesson.id),
              ).length;

              const total = courseLessons.length;
              const percentage =
                total > 0 ? Math.round((done / total) * 100) : 0;

              return (
                <li key={course.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/courses/${course.id}`}
                      className="font-medium hover:underline"
                    >
                      {course.title}
                    </Link>

                    <span className="shrink-0 text-xs text-cova-mute">
                      {t("dashboard.lessonsCount", { done, total })}
                    </span>
                  </div>

                  <ProgressBar
                    value={percentage}
                    max={100}
                    label={`${course.title} progress`}
                    className="mt-2"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
