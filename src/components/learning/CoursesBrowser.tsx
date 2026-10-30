
"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectFilter } from "@/components/ui/FormField";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { CourseCard } from "@/components/learning/CourseCard";
import { matchesQuery } from "@/lib/utils";
import { getSupabase } from "@/lib/supabase/client";
import type { Course, LessonType } from "@/types";
import { useT } from "@/i18n/client";

const TABS = ["all", "mine", "created"] as const;
const ALL = "all";
const levels = [ALL, "Beginner", "Intermediate", "Advanced"];

type CourseRow = {
  id: string;
  title: string;
  description: string;
  level: string;
  category: string;
  instructor: string;
  tags: string[] | null;
  created_by: string | null;
};

type LessonRow = {
  id: string;
  course_id: string;
  title: string;
  type: LessonType;
  minutes: number;
  summary: string;
  position: number;
};

export function CoursesBrowser() {
  const t = useT();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>([]);
  const [ownedCourses, setOwnedCourses] = useState<string[]>([]);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(ALL);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const levelKey = (value: string) => {
    if (value === "Beginner") return t("courses.level.beginner");
    if (value === "Intermediate") return t("courses.level.intermediate");
    if (value === "Advanced") return t("courses.level.advanced");
    return t("courses.level.all");
  };

  useEffect(() => {
    let active = true;

    async function loadCourses() {
      setLoading(true);
      setErrorMessage("");

      try {
        const supabase = getSupabase();
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          if (active) {
            setCourses([]);
            setEnrolledCourses([]);
            setOwnedCourses([]);
            setCompletedLessons([]);
          }
          return;
        }

        const userId = authData.user.id;

        const [courseResult, lessonResult, enrollmentResult, completionResult] =
          await Promise.all([
            supabase
              .from("courses")
              .select(
                "id, title, description, level, category, instructor, tags, created_by",
              )
              .order("created_at", { ascending: false }),

            supabase
              .from("course_lessons")
              .select("id, course_id, title, type, minutes, summary, position")
              .order("position", { ascending: true }),

            supabase
              .from("course_enrollments")
              .select("course_id")
              .eq("user_id", userId),

            supabase
              .from("lesson_completions")
              .select("lesson_id")
              .eq("user_id", userId),
          ]);

        if (courseResult.error) throw courseResult.error;
        if (lessonResult.error) throw lessonResult.error;
        if (enrollmentResult.error) throw enrollmentResult.error;
        if (completionResult.error) throw completionResult.error;

        const courseRows = (courseResult.data ?? []) as CourseRow[];
        const lessonRows = (lessonResult.data ?? []) as LessonRow[];

        const loadedCourses: Course[] = courseRows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          level: row.level as Course["level"],
          category: row.category,
          instructor: row.instructor,
          tags: row.tags ?? [],
          learners: 0,
          lessons: lessonRows
            .filter((lesson) => lesson.course_id === row.id)
            .map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              type: lesson.type,
              minutes: lesson.minutes,
              summary: lesson.summary,
            })),
        }));

        const enrolledIds = (enrollmentResult.data ?? []).map(
          (row) => row.course_id,
        );

        const ownedIds = courseRows
          .filter((row) => row.created_by === userId)
          .map((row) => row.id);

        if (active) {
          setCourses(loadedCourses);
          setEnrolledCourses(enrolledIds);
          setOwnedCourses(ownedIds);
          setCompletedLessons(
            (completionResult.data ?? []).map((row) => row.lesson_id),
          );
        }
      } catch (error) {
        console.error("Erreur de chargement des cours :", error);

        if (active) {
          setErrorMessage(
            t("courses.loadError"),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      active = false;
    };
  }, [t]);

  const myCourseIds = useMemo(
    () => Array.from(new Set([...enrolledCourses, ...ownedCourses])),
    [enrolledCourses, ownedCourses],
  );

  const results = useMemo(
    () =>
      courses.filter((course) => {
        const belongsToTab =
          tab === "all"
            ? true
            : tab === "mine"
              ? myCourseIds.includes(course.id)
              : ownedCourses.includes(course.id);

        return (
          belongsToTab &&
          (level === ALL || course.level === level) &&
          matchesQuery(
            query,
            course.title,
            course.description,
            course.tags,
            course.category,
            course.instructor,
          )
        );
      }),
    [courses, tab, myCourseIds, ownedCourses, level, query],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-cova-line p-6">
        <p className="text-sm text-cova-mute">{t("courses.loading")}</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("courses.unavailable")}
        description={errorMessage}
        action={
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            {t("common.tryAgain")}
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          label={t("courses.view")}
          counts={{
            mine: myCourseIds.length,
            created: ownedCourses.length,
          }}
          labels={{ all: t("courses.tab.all"), mine: t("courses.tab.mine"), created: t("courses.tab.created") }}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            label={t("courses.search")}
            placeholder={t("courses.searchPlaceholder")}
            value={query}
            onChange={setQuery}
            className="sm:w-72"
          />

          <SelectFilter
            label={t("courses.level")}
            options={levels.map(levelKey)}
            value={levelKey(level)}
            onChange={(event) => setLevel(levels.find((option) => levelKey(option) === event.target.value) ?? ALL)}
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-cova-mute" aria-live="polite">
        {t("courses.count", { count: results.length })}
      </p>

      {results.length === 0 ? (
        <EmptyState
          icon={courses.length === 0 ? BookOpen : SearchX}
          title={
            courses.length === 0
              ? t("courses.empty.noneTitle")
              : tab === "mine"
                ? t("courses.empty.mineTitle")
                : tab === "created"
                  ? t("courses.empty.createdTitle")
                  : t("courses.empty.searchTitle")
          }
          description={
            courses.length === 0
              ? t("courses.empty.noneDescription")
              : tab === "mine"
                ? t("courses.empty.mineDescription")
                : tab === "created"
                  ? t("courses.empty.createdDescription")
                  : t("courses.empty.searchDescription")
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setLevel(ALL);
                setTab("all");
              }}
            >
              {t("courses.showAll")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              enrolled={enrolledCourses.includes(course.id)}
              completedLessons={completedLessons}
            />
          ))}
        </div>
      )}
    </>
  );
}
