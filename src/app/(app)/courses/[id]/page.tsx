"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, SearchX } from "lucide-react";
import { CourseDetail } from "@/components/learning/CourseDetail";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import type { Course, LessonType } from "@/types";

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  category: string;
  instructor: string;
  tags: string[] | null;
};

type LessonRow = {
  id: string;
  course_id: string;
  title: string;
  type: string;
  minutes: number;
  summary: string | null;
  content: string | null;
  position: number;
};

export default function CoursePage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCourse() {
      setLoading(true);
      setErrorMessage("");
      setCourse(null);

      try {
        const supabase = getSupabase();

        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .select("id, title, description, level, category, instructor, tags")
          .eq("id", id)
          .maybeSingle();

        if (courseError) throw courseError;

        if (!courseData) {
          if (active) setCourse(null);
          return;
        }

        const row = courseData as CourseRow;

        const { data: lessonData, error: lessonError } = await supabase
          .from("course_lessons")
          .select("id, course_id, title, type, minutes, summary, content, position")
          .eq("course_id", id)
          .order("position", { ascending: true });

        if (lessonError) throw lessonError;

        const lessons = (lessonData ?? []) as LessonRow[];

        const loadedCourse: Course = {
          id: row.id,
          title: row.title,
          description: row.description ?? "",
          level: row.level as Course["level"],
          category: row.category,
          instructor: row.instructor,
          tags: row.tags ?? [],
          learners: 0,
          lessons: lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            type: lesson.type as LessonType,
            minutes: lesson.minutes,
            summary: lesson.summary ?? "",
            content: lesson.content ?? "",
          })),
        };

        if (active) setCourse(loadedCourse);
      } catch (error) {
        console.error("Unable to load course:", error);

        if (active) {
          setErrorMessage(t("course.loadError"));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable for this fetch
  }, [id]);

  if (loading) {
    return (
      <div className="rounded-xl border border-cova-line p-6">
        <p className="text-sm text-cova-mute">Chargement du cours...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("course.unavailableTitle")}
        description={errorMessage}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {t("course.retry")}
          </Button>
        }
      />
    );
  }

  if (!course) {
    return (
      <EmptyState
        icon={BookOpen}
        title={t("course.notFoundTitle")}
        description={t("course.notFoundDesc")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              router.push("/courses");
            }}
          >
            Retour aux cours
          </Button>
        }
      />
    );
  }

  return <CourseDetail course={course} />;
}
