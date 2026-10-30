"use client";

import Link from "next/link";
import { Clock, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { courseProgress } from "@/lib/progress";
import type { Course } from "@/types";
import { useI18n, useT } from "@/i18n/client";

interface CourseCardProps {
  course: Course;
  enrolled: boolean;
  completedLessons: string[];
}

export function CourseCard({ course, enrolled, completedLessons }: CourseCardProps) {
  const t = useT();
  const { formatTag } = useI18n();
  const minutes = course.lessons.reduce((sum, l) => sum + l.minutes, 0);
  const progress = courseProgress(course, completedLessons);
  const level = course.level === "Beginner"
    ? t("courses.level.beginner")
    : course.level === "Intermediate"
      ? t("courses.level.intermediate")
      : t("courses.level.advanced");

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="soft">{level}</Badge>
        <span className="text-xs text-cova-mute">{course.category}</span>
      </div>
      <Link href={`/courses/${course.id}`} className="mt-3 font-semibold hover:underline">
        {course.title}
      </Link>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-cova-mute">{course.description}</p>
      <div className="mt-4 flex items-center gap-4 text-xs text-cova-mute">
        <span className="flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> {course.instructor}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {Math.round(minutes / 6) / 10} h
        </span>
      </div>
      {enrolled ? (
        <div className="mt-4">
          <ProgressBar value={progress.pct} label={t("courses.progressLabel", { title: course.title })} />
          <p className="mt-1.5 text-xs text-cova-mute">
            {t("courses.progressSummary", { done: progress.done, total: progress.total })}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-cova-mute">
          {t("courses.learners", { count: course.learners.toLocaleString(formatTag) })}
        </p>
      )}
    </Card>
  );
}
