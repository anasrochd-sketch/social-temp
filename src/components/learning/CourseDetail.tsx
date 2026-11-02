"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  BookText,
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  PlayCircle,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { courseProgress } from "@/lib/progress";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { cn, dueLabel } from "@/lib/utils";
import type { Course, Lesson, LessonType } from "@/types";
import { CourseResources } from "@/components/learning/CourseResources";

const lessonIcon = {
  video: PlayCircle,
  reading: BookText,
  exercise: Code2,
} satisfies Record<LessonType, typeof PlayCircle>;

type ContentKind = "lesson" | "exercise";

type TpSubmission = {
  id: string;
  course_id: string;
  lesson_id: string;
  student_id: string;
  answer: string;
  status: "submitted" | "reviewed";
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type RelatedAssignment = { id: string; title: string; due_at: string; points: number };

const submissionColumns =
  "id, course_id, lesson_id, student_id, answer, status, grade, feedback, submitted_at, reviewed_at";
const RESOURCE_BUCKET = "shared-resources";
const ASSIGNMENT_ATTACHMENT_BUCKET = "assignment-attachments";
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const SUPPORTED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function CourseDetail({ course }: { course: Course }) {
  const toast = useToast();
  const t = useT();

  const [userId, setUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [, setIsPrivateCourse] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInviteCode, setCreatingInviteCode] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>(course.lessons);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [savingLesson, setSavingLesson] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<TpSubmission[]>([]);
  const [relatedAssignments, setRelatedAssignments] = useState<RelatedAssignment[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [savingSubmission, setSavingSubmission] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState<string | null>(null);

  const [editorKind, setEditorKind] = useState<ContentKind | null>(null);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<"reading" | "video">("reading");
  const [savingContent, setSavingContent] = useState(false);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [exerciseDueAt, setExerciseDueAt] = useState("");
  const [resourceRefreshKey, setResourceRefreshKey] = useState(0);

  const [openLesson, setOpenLesson] = useState<string | null>(course.lessons[0]?.id ?? null);

  const progress = courseProgress({ ...course, lessons }, completedLessons);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLessons(course.lessons);
      setOpenLesson(course.lessons[0]?.id ?? null);
    });

    return () => cancelAnimationFrame(frame);
  }, [course.id, course.lessons]);

  const loadProgress = useCallback(async () => {
    try {
      setInviteCode(null);
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setUserId(null);
        setIsOwner(false);
        setInviteCode(null);
        setEnrolled(false);
        setCompletedLessons([]);
        setSubmissions([]);
        return;
      }

      const currentUserId = authData.user.id;
      setUserId(currentUserId);

      const [ownerResult, enrollmentResult, lessonsResult, submissionsResult] = await Promise.all([
        supabase.from("courses").select("created_by, published").eq("id", course.id).maybeSingle(),

        supabase
          .from("course_enrollments")
          .select("course_id")
          .eq("user_id", currentUserId)
          .eq("course_id", course.id)
          .maybeSingle(),

        supabase
          .from("lesson_completions")
          .select("lesson_id")
          .eq("user_id", currentUserId)
          .eq("course_id", course.id),

        supabase
          .from("tp_submissions")
          .select(submissionColumns)
          .eq("course_id", course.id)
          .order("submitted_at", { ascending: false }),
      ]);

      if (ownerResult.error) throw ownerResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;
      if (lessonsResult.error) throw lessonsResult.error;
      if (submissionsResult.error) throw submissionsResult.error;

      const owner = ownerResult.data?.created_by === currentUserId;
      const privateCourse = ownerResult.data?.published === false;
      setIsOwner(owner);
      setIsPrivateCourse(privateCourse);
      setEnrolled(Boolean(enrollmentResult.data));
      setCompletedLessons((lessonsResult.data ?? []).map((row) => row.lesson_id));

      const loadedSubmissions = (submissionsResult.data ?? []) as TpSubmission[];

      if (owner) {
        const { data: code, error: inviteCodeError } = await supabase.rpc(
          "get_course_invite_code",
          { p_course_id: course.id },
        );
        if (inviteCodeError) {
          console.warn(
            "Course invitation code is unavailable. Apply the course invite-code migration.",
            inviteCodeError.message,
          );
          setInviteCode(null);
        } else {
          setInviteCode(code as string | null);
        }
      } else {
        setInviteCode(null);
      }

      setSubmissions(loadedSubmissions);

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("assignments")
        .select("id,title,due_at,points")
        .eq("course_id", course.id)
        .order("due_at", { ascending: true });
      if (assignmentError) {
        console.warn("Unable to load course assignments:", assignmentError.message);
        setRelatedAssignments([]);
      } else {
        setRelatedAssignments((assignmentRows ?? []) as RelatedAssignment[]);
      }

      setGradeDrafts(
        Object.fromEntries(
          loadedSubmissions.map((item) => [item.id, item.grade === null ? "" : String(item.grade)]),
        ),
      );

      setFeedbackDrafts(
        Object.fromEntries(loadedSubmissions.map((item) => [item.id, item.feedback ?? ""])),
      );
    } catch (error) {
      console.error("Unable to load course data:", error);
      toast.push("Could not load course data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [course.id, toast]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadProgress();
    });

    return () => cancelAnimationFrame(frame);
  }, [loadProgress]);

  function openContentEditor(kind: ContentKind) {
    setEditorKind(kind);
    setTitle("");
    setMinutes("10");
    setSummary("");
    setContent("");
    setContentType("reading");
    setContentFile(null);
    setExerciseDueAt(localDateTimeValue(new Date(Date.now() + 24 * 60 * 60_000)));
  }

  function closeContentEditor() {
    if (savingContent) return;
    setEditorKind(null);
  }

  async function handleCreateContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId || !isOwner || !editorKind) {
      toast.push("Only the course creator can add lessons or exercises.");
      return;
    }

    const cleanTitle = title.trim();
    const cleanSummary = summary.trim();
    const cleanContent = content.trim();
    const parsedMinutes = Number(minutes);

    if (!cleanTitle || !cleanContent) {
      toast.push("Please enter a title and the full content.");
      return;
    }

    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 1440) {
      toast.push("Duration must be between 1 and 1440 minutes.");
      return;
    }

    if (contentFile && !SUPPORTED_UPLOAD_TYPES.has(contentFile.type)) {
      toast.push("Choose a supported PDF, Office, text or image file.");
      return;
    }
    if (contentFile && contentFile.size > MAX_UPLOAD_SIZE) {
      toast.push("The attached file must be 20 MB or smaller.");
      return;
    }
    if (
      editorKind === "exercise" &&
      (!new Date(exerciseDueAt).getTime() || new Date(exerciseDueAt).getTime() <= Date.now())
    ) {
      toast.push("Choose a TP deadline in the future.");
      return;
    }

    setSavingContent(true);

    try {
      const supabase = getSupabase();

      const { data: ownerData, error: ownerError } = await supabase
        .from("courses")
        .select("created_by")
        .eq("id", course.id)
        .maybeSingle();

      if (ownerError) throw ownerError;

      if (ownerData?.created_by !== userId) {
        setIsOwner(false);
        toast.push("You do not have permission to edit this course.");
        return;
      }

      if (editorKind === "exercise") {
        const assignmentId = crypto.randomUUID();
        let attachmentPath: string | null = null;
        const { error: assignmentError } = await supabase.from("assignments").insert({
          id: assignmentId,
          course_id: course.id,
          created_by: userId,
          title: cleanTitle,
          description: `${cleanSummary ? `${cleanSummary}\n\n` : ""}${cleanContent}`,
          due_at: new Date(exerciseDueAt).toISOString(),
          points: 100,
          kind: "coding",
        });
        if (assignmentError) throw assignmentError;
        try {
          if (contentFile) {
            const safeName = contentFile.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
            attachmentPath = `${userId}/${assignmentId}/${crypto.randomUUID()}-${safeName}`;
            const { error } = await supabase.storage
              .from(ASSIGNMENT_ATTACHMENT_BUCKET)
              .upload(attachmentPath, contentFile, {
                contentType: contentFile.type,
                upsert: false,
              });
            if (error) throw error;
            const { error: updateError } = await supabase
              .from("assignments")
              .update({
                attachment_path: attachmentPath,
                attachment_name: contentFile.name,
              })
              .eq("id", assignmentId);
            if (updateError) throw updateError;
          }
        } catch (error) {
          if (attachmentPath)
            await supabase.storage.from(ASSIGNMENT_ATTACHMENT_BUCKET).remove([attachmentPath]);
          await supabase.from("assignments").delete().eq("id", assignmentId);
          throw error;
        }
        const newAssignment = {
          id: assignmentId,
          title: cleanTitle,
          due_at: new Date(exerciseDueAt).toISOString(),
          points: 100,
        };
        setRelatedAssignments((current) =>
          [...current, newAssignment].sort((a, b) => a.due_at.localeCompare(b.due_at)),
        );
        setEditorKind(null);
        setTitle("");
        setMinutes("10");
        setSummary("");
        setContent("");
        setContentFile(null);
        toast.push("TP added to assignments successfully.");
        return;
      }

      const type: LessonType = contentType;

      const nextPosition =
        lessons.reduce((highest, lesson, index) => Math.max(highest, index + 1), 0) + 1;

      const { data: insertedLesson, error: insertError } = await supabase
        .from("course_lessons")
        .insert({
          id: crypto.randomUUID(),
          course_id: course.id,
          title: cleanTitle,
          type,
          minutes: parsedMinutes,
          summary: cleanSummary,
          content: cleanContent,
          position: nextPosition,
        })
        .select("id, course_id, title, type, minutes, summary, content, position")
        .single();

      if (insertError) throw insertError;

      // Lessons are also published as course resources. If no file was attached,
      // publish the lesson text as a small text document so it remains downloadable.
      const resourceFile =
        contentFile ??
        new File(
          [`${cleanTitle}\n\n${cleanSummary ? `${cleanSummary}\n\n` : ""}${cleanContent}`],
          `${cleanTitle.replace(/[^\p{L}\p{N}._-]+/gu, "-")}.txt`,
          { type: "text/plain" },
        );
      let resourcePath: string | null = null;
      let resourceId: string | null = null;
      try {
        const safeName = resourceFile.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        resourcePath = `${userId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(RESOURCE_BUCKET)
          .upload(resourcePath, resourceFile, {
            contentType: resourceFile.type || "text/plain",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { data: resource, error: resourceError } = await supabase
          .from("shared_resources")
          .insert({
            title: cleanTitle,
            type: contentType === "video" ? "Video" : "Article",
            description: cleanSummary || cleanContent.slice(0, 1000),
            category: "Course lesson",
            minutes: parsedMinutes,
            file_name: contentFile?.name ?? resourceFile.name,
            mime_type: resourceFile.type || "text/plain",
            file_size: resourceFile.size,
            storage_path: resourcePath,
            uploaded_by: userId,
          })
          .select("id")
          .single();
        if (resourceError) throw resourceError;
        resourceId = resource.id as string;
        const { error: linkError } = await supabase.from("course_resources").insert({
          course_id: course.id,
          resource_id: resourceId,
          added_by: userId,
        });
        if (linkError) throw linkError;
      } catch (error) {
        if (resourceId) await supabase.from("shared_resources").delete().eq("id", resourceId);
        if (resourcePath) await supabase.storage.from(RESOURCE_BUCKET).remove([resourcePath]);
        await supabase.from("course_lessons").delete().eq("id", insertedLesson.id);
        throw error;
      }

      const newLesson: Lesson = {
        id: insertedLesson.id,
        title: insertedLesson.title,
        type: insertedLesson.type as LessonType,
        minutes: insertedLesson.minutes,
        summary: insertedLesson.summary ?? "",
        content: insertedLesson.content ?? "",
      };

      setLessons((current) => [...current, newLesson]);
      setOpenLesson(newLesson.id);
      setEditorKind(null);
      setTitle("");
      setMinutes("10");
      setSummary("");
      setContent("");
      setContentFile(null);
      setResourceRefreshKey((key) => key + 1);

      toast.push("Lesson added and published in resources.");
    } catch (error) {
      console.error("Unable to add course content:", error);
      toast.push("Could not add content. Check your connection and try again.");
    } finally {
      setSavingContent(false);
    }
  }

  async function handleSubmitTp(event: FormEvent<HTMLFormElement>, lesson: Lesson) {
    event.preventDefault();

    if (!userId) {
      toast.push("Please sign in to submit your work.");
      return;
    }

    if (!enrolled || isOwner || lesson.type !== "exercise") {
      toast.push("You must be enrolled as a student to submit this TP.");
      return;
    }

    const answer = (answers[lesson.id] ?? "").trim();

    if (!answer) {
      toast.push("Write your answer before submitting.");
      return;
    }

    if (answer.length > 50000) {
      toast.push("Your answer must not exceed 50,000 characters.");
      return;
    }

    if (submissions.some((item) => item.lesson_id === lesson.id && item.student_id === userId)) {
      toast.push("You have already submitted this TP.");
      return;
    }

    setSavingSubmission(lesson.id);

    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("tp_submissions")
        .insert({
          course_id: course.id,
          lesson_id: lesson.id,
          student_id: userId,
          answer,
        })
        .select(submissionColumns)
        .single();

      if (error) throw error;

      const newSubmission = data as TpSubmission;

      setSubmissions((current) => [newSubmission, ...current]);
      setAnswers((current) => ({ ...current, [lesson.id]: "" }));

      toast.push("Your TP has been submitted successfully.");
    } catch (error) {
      console.error("Unable to submit TP:", error);
      toast.push(
        "Could not submit your TP. Check your connection or whether it was already submitted.",
      );
    } finally {
      setSavingSubmission(null);
    }
  }

  async function handleReviewTp(event: FormEvent<HTMLFormElement>, submission: TpSubmission) {
    event.preventDefault();

    if (!userId || !isOwner) {
      toast.push("Only the course creator can review submissions.");
      return;
    }

    const rawGrade = gradeDrafts[submission.id] ?? "";
    const grade = Number(rawGrade);
    const feedback = (feedbackDrafts[submission.id] ?? "").trim();

    if (rawGrade.trim() === "" || !Number.isFinite(grade) || grade < 0 || grade > 100) {
      toast.push("Enter a grade between 0 and 100.");
      return;
    }

    setSavingReview(submission.id);

    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("tp_submissions")
        .update({
          status: "reviewed",
          grade,
          feedback: feedback || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submission.id)
        .eq("course_id", course.id)
        .select(submissionColumns)
        .single();

      if (error) throw error;

      const updatedSubmission = data as TpSubmission;

      setSubmissions((current) =>
        current.map((item) => (item.id === updatedSubmission.id ? updatedSubmission : item)),
      );

      toast.push("TP correction saved successfully.");
    } catch (error) {
      console.error("Unable to review TP:", error);
      toast.push("Could not save the correction. Check the Supabase permissions and try again.");
    } finally {
      setSavingReview(null);
    }
  }

  async function toggleEnrollment() {
    if (!userId) {
      toast.push("Please sign in to enrol in a course.");
      return;
    }

    setSavingEnrollment(true);

    try {
      const supabase = getSupabase();

      if (enrolled) {
        const { error } = await supabase
          .from("course_enrollments")
          .delete()
          .eq("user_id", userId)
          .eq("course_id", course.id);

        if (error) throw error;

        setEnrolled(false);
        toast.push(`Unenrolled from ${course.title}`);
      } else {
        const { error } = await supabase
          .from("course_enrollments")
          .upsert({ user_id: userId, course_id: course.id }, { onConflict: "user_id,course_id" });

        if (error) throw error;

        setEnrolled(true);
        toast.push(`Enrolled in ${course.title}`);
      }
    } catch (error) {
      console.error("Unable to update course enrolment:", error);
      toast.push("Could not update enrolment. Please try again.");
    } finally {
      setSavingEnrollment(false);
    }
  }

  async function toggleLesson(lessonId: string, done: boolean) {
    if (!userId) {
      toast.push("Please sign in to track your lessons.");
      return;
    }

    if (!enrolled) {
      toast.push("Enrol in the course to track your progress.");
      return;
    }

    setSavingLesson(lessonId);

    try {
      const supabase = getSupabase();

      if (done) {
        const { error } = await supabase
          .from("lesson_completions")
          .delete()
          .eq("user_id", userId)
          .eq("course_id", course.id)
          .eq("lesson_id", lessonId);

        if (error) throw error;

        setCompletedLessons((current) => current.filter((id) => id !== lessonId));
        toast.push("Lesson marked as not done");
      } else {
        const { error } = await supabase.from("lesson_completions").upsert(
          {
            user_id: userId,
            course_id: course.id,
            lesson_id: lessonId,
          },
          { onConflict: "user_id,lesson_id" },
        );

        if (error) throw error;

        setCompletedLessons((current) =>
          current.includes(lessonId) ? current : [...current, lessonId],
        );
        toast.push("Lesson marked as complete");
      }
    } catch (error) {
      console.error("Unable to update lesson completion:", error);
      toast.push("Could not save lesson progress. Please try again.");
    } finally {
      setSavingLesson(null);
    }
  }

  async function copyInviteCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.push(t("courses.codeCopied"));
    } catch {
      toast.push(t("courses.codeCopyFailed"));
    }
  }

  async function createInviteCode() {
    if (!isOwner || creatingInviteCode) return;
    setCreatingInviteCode(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("create_course_invite_code", {
        p_course_id: course.id,
      });
      if (error) throw error;
      if (!data) throw new Error("The invitation-code function returned no code.");

      const code = String(data);
      setInviteCode(code);

      const { error: saveError } = await supabase.rpc("save_course_invite_code", {
        p_course_id: course.id,
        p_code: code,
      });
      toast.push(saveError ? t("courses.codeGeneratedNotSaved") : t("courses.codeGenerated"));
    } catch (error) {
      console.error("Could not generate course invitation code:", error);
      toast.push(t("courses.codeGenerateFailed"));
    } finally {
      setCreatingInviteCode(false);
    }
  }

  return (
    <>
      <Link
        href="/courses"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-cova-mute hover:text-cova-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to courses
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="soft">{course.level}</Badge>
              <Badge tone="outline">{course.category}</Badge>
              {isOwner && <Badge tone="soft">Your course</Badge>}
            </div>

            <h1 className="mt-3 text-2xl font-semibold">{course.title}</h1>

            <p className="mt-1.5 text-sm text-cova-mute">{course.description}</p>

            <p className="mt-3 text-sm text-cova-mute">
              Taught by {course.instructor} · {course.learners.toLocaleString("en-US")} learners
            </p>

            {isOwner && inviteCode && (
              <div className="mt-4 rounded-lg border border-cova-line p-4">
                <p className="text-sm font-semibold">{t("courses.yourInvitationCode")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <code
                    dir="ltr"
                    className="rounded bg-cova-pale px-3 py-2 font-mono text-lg tracking-widest"
                  >
                    {inviteCode}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void copyInviteCode()}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("courses.copyCode")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-cova-mute">{t("courses.shareCode")}</p>
              </div>
            )}

            {isOwner && !inviteCode && (
              <div className="mt-4 rounded-lg border border-cova-line p-4">
                <p className="text-sm text-cova-mute">{t("courses.noInvitationCode")}</p>
                <Button
                  type="button"
                  className="mt-3"
                  variant="secondary"
                  size="sm"
                  disabled={creatingInviteCode}
                  onClick={() => void createInviteCode()}
                >
                  {creatingInviteCode ? t("courses.generatingCode") : t("courses.generateCode")}
                </Button>
              </div>
            )}
          </div>

          <div className="w-full md:w-60">
            {enrolled && (
              <div className="mb-3">
                <div className="mb-1.5 flex justify-between text-xs text-cova-mute">
                  <span>Progress</span>
                  <span>{progress.pct}%</span>
                </div>
                <ProgressBar value={progress.pct} label={t("course.progress")} />
              </div>
            )}

            <Button
              className="w-full"
              variant={enrolled ? "secondary" : "primary"}
              disabled={loading || savingEnrollment || !userId}
              onClick={() => void toggleEnrollment()}
            >
              {loading
                ? t("course.loading")
                : savingEnrollment
                  ? "Saving..."
                  : enrolled
                    ? "Unenrol"
                    : userId
                      ? "Enrol in course"
                      : "Sign in to enrol"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <CourseResources key={resourceRefreshKey} courseId={course.id} isOwner={isOwner} />

      {isOwner && (
        <Card className="mt-6">
          <CardBody className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold">Manage course content</h2>
              <p className="mt-1 text-sm text-cova-mute">
                Add lessons or practical exercises for your students.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openContentEditor("lesson")} disabled={savingContent}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add a lesson
              </Button>

              <Button
                variant="secondary"
                onClick={() => openContentEditor("exercise")}
                disabled={savingContent}
              >
                <Code2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add a TP / exercise
              </Button>
            </div>

            {editorKind && (
              <form
                onSubmit={(event) => void handleCreateContent(event)}
                className="space-y-4 rounded-xl border border-cova-line p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">
                    {editorKind === "exercise" ? "Create a practical exercise" : "Create a lesson"}
                  </h3>

                  <button
                    type="button"
                    onClick={closeContentEditor}
                    disabled={savingContent}
                    className="rounded-md p-1 text-cova-mute hover:text-cova-ink"
                    aria-label={t("course.closeForm")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <label htmlFor="content-title" className="mb-1.5 block text-sm font-medium">
                    Title
                  </label>
                  <input
                    id="content-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={200}
                    placeholder={
                      editorKind === "exercise"
                        ? "Example: TP 1 — Build a simple page"
                        : "Example: Introduction to programming"
                    }
                    className="w-full rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                  />
                </div>

                {editorKind === "exercise" && (
                  <div>
                    <label htmlFor="tp-deadline" className="mb-1.5 block text-sm font-medium">
                      Deadline
                    </label>
                    <input
                      id="tp-deadline"
                      type="datetime-local"
                      value={exerciseDueAt}
                      min={localDateTimeValue(new Date(now + 60_000))}
                      onChange={(event) => setExerciseDueAt(event.target.value)}
                      required
                      className="w-full rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                    />
                    <p className="mt-1 text-xs text-cova-mute">
                      Score starts at 100. Late submissions receive a score reduced proportionally
                      to the time allowed.
                    </p>
                  </div>
                )}

                {editorKind === "lesson" && (
                  <div>
                    <label htmlFor="content-type" className="mb-1.5 block text-sm font-medium">
                      Lesson format
                    </label>
                    <select
                      id="content-type"
                      value={contentType}
                      onChange={(event) =>
                        setContentType(event.target.value as "reading" | "video")
                      }
                      className="w-full rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                    >
                      <option value="reading">Reading</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                )}

                {editorKind === "lesson" && (
                  <div>
                    <label htmlFor="content-minutes" className="mb-1.5 block text-sm font-medium">
                      Duration (minutes)
                    </label>
                    <input
                      id="content-minutes"
                      type="number"
                      min={1}
                      max={1440}
                      step={1}
                      value={minutes}
                      onChange={(event) => setMinutes(event.target.value)}
                      required
                      className="w-full rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="content-document" className="mb-1.5 block text-sm font-medium">
                    Attach a document (optional)
                  </label>
                  <input
                    id="content-document"
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                    onChange={(event) => setContentFile(event.target.files?.[0] ?? null)}
                    disabled={savingContent}
                    className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5"
                  />
                  <p className="mt-1 text-xs text-cova-mute">
                    PDF, Office, text or image · up to 20 MB
                    {editorKind === "lesson"
                      ? ". A text resource is generated automatically when no file is attached."
                      : ". Students can download it from Assignments."}
                  </p>
                  {contentFile && <p className="mt-1 text-xs text-cova-mute">{contentFile.name}</p>}
                </div>

                <div>
                  <label htmlFor="content-summary" className="mb-1.5 block text-sm font-medium">
                    Short summary
                  </label>
                  <textarea
                    id="content-summary"
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    maxLength={2000}
                    rows={2}
                    placeholder={t("course.learning")}
                    className="w-full resize-y rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                  />
                </div>

                <div>
                  <label htmlFor="content-body" className="mb-1.5 block text-sm font-medium">
                    {editorKind === "exercise" ? "TP instructions" : "Full lesson content"}
                  </label>
                  <textarea
                    id="content-body"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    required
                    maxLength={50000}
                    rows={8}
                    placeholder={
                      editorKind === "exercise"
                        ? "Describe the task, steps, requirements and expected result..."
                        : "Write the lesson here. You can include explanations, examples and steps..."
                    }
                    className="w-full resize-y rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                  />
                  <p className="mt-1 text-xs text-cova-mute">
                    Maximum 50,000 characters. Line breaks are preserved.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={savingContent}>
                    {savingContent
                      ? "Saving..."
                      : editorKind === "exercise"
                        ? "Save TP"
                        : "Save lesson"}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={savingContent}
                    onClick={closeContentEditor}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="lessons-heading" className="lg:col-span-2">
          <h2 id="lessons-heading" className="mb-3 text-base font-semibold">
            Lessons ({lessons.length})
          </h2>

          {lessons.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-cova-mute">
                  No lessons have been added to this course yet.
                </p>
              </CardBody>
            </Card>
          ) : (
            <ul className="space-y-2">
              {lessons.map((lesson, i) => {
                const done = completedLessons.includes(lesson.id);
                const Icon = lessonIcon[lesson.type];
                const open = openLesson === lesson.id;

                const mySubmission = userId
                  ? submissions.find(
                      (item) => item.lesson_id === lesson.id && item.student_id === userId,
                    )
                  : undefined;

                const lessonSubmissions = submissions.filter(
                  (item) => item.lesson_id === lesson.id,
                );

                return (
                  <li key={lesson.id}>
                    <Card className={cn(open && "border-cova-soft")}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenLesson(open ? null : lesson.id)}
                        className="flex w-full items-center gap-3 p-4 text-start"
                      >
                        {done ? (
                          <CheckCircle2
                            className="h-5 w-5 shrink-0 text-cova-muted"
                            aria-label={t("course.completed")}
                          />
                        ) : (
                          <Circle
                            className="h-5 w-5 shrink-0 text-cova-line"
                            aria-label={t("course.notCompleted")}
                          />
                        )}

                        <span className="flex-1">
                          <span className="block text-sm font-medium">
                            {i + 1}. {lesson.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-cova-mute">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {lesson.type} · {lesson.minutes} min
                          </span>
                        </span>
                      </button>

                      {open && (
                        <div className="border-t border-cova-line px-4 pb-4 pt-3">
                          {lesson.summary && (
                            <p className="text-sm font-medium">{lesson.summary}</p>
                          )}

                          {lesson.content ? (
                            <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-cova-mute">
                              {lesson.content}
                            </div>
                          ) : (
                            !lesson.summary && (
                              <p className="text-sm text-cova-mute">
                                No content has been added yet.
                              </p>
                            )
                          )}

                          {lesson.type === "exercise" && !loading && (
                            <div className="mt-5 rounded-xl border border-cova-line p-4">
                              <h3 className="text-sm font-semibold">
                                {isOwner ? "Student submissions" : "Submit your TP"}
                              </h3>

                              {isOwner ? (
                                <div className="mt-3 space-y-4">
                                  {lessonSubmissions.length === 0 ? (
                                    <p className="text-sm text-cova-mute">No submissions yet.</p>
                                  ) : (
                                    lessonSubmissions.map((submission) => (
                                      <div
                                        key={submission.id}
                                        className="rounded-lg border border-cova-line p-3"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="text-xs text-cova-mute">
                                            Student ID: {submission.student_id}
                                          </span>
                                          <Badge
                                            tone={
                                              submission.status === "reviewed" ? "soft" : "outline"
                                            }
                                          >
                                            {submission.status === "reviewed"
                                              ? "Reviewed"
                                              : "Submitted"}
                                          </Badge>
                                        </div>

                                        <p className="mt-2 text-xs text-cova-mute">
                                          Submitted: {formatDate(submission.submitted_at)}
                                        </p>

                                        <div className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-cova-soft/20 p-3 text-sm">
                                          {submission.answer}
                                        </div>

                                        <form
                                          onSubmit={(event) =>
                                            void handleReviewTp(event, submission)
                                          }
                                          className="mt-4 space-y-3"
                                        >
                                          <div>
                                            <label
                                              htmlFor={`grade-${submission.id}`}
                                              className="mb-1 block text-sm font-medium"
                                            >
                                              Grade out of 100
                                            </label>
                                            <input
                                              id={`grade-${submission.id}`}
                                              type="number"
                                              min={0}
                                              max={100}
                                              step="0.01"
                                              required
                                              value={gradeDrafts[submission.id] ?? ""}
                                              onChange={(event) =>
                                                setGradeDrafts((current) => ({
                                                  ...current,
                                                  [submission.id]: event.target.value,
                                                }))
                                              }
                                              className="w-full rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                                            />
                                          </div>

                                          <div>
                                            <label
                                              htmlFor={`feedback-${submission.id}`}
                                              className="mb-1 block text-sm font-medium"
                                            >
                                              Feedback
                                            </label>
                                            <textarea
                                              id={`feedback-${submission.id}`}
                                              rows={3}
                                              maxLength={10000}
                                              value={feedbackDrafts[submission.id] ?? ""}
                                              onChange={(event) =>
                                                setFeedbackDrafts((current) => ({
                                                  ...current,
                                                  [submission.id]: event.target.value,
                                                }))
                                              }
                                              placeholder="Explain what was done well and what can be improved..."
                                              className="w-full resize-y rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                                            />
                                          </div>

                                          {submission.reviewed_at && (
                                            <p className="text-xs text-cova-mute">
                                              Last reviewed: {formatDate(submission.reviewed_at)}
                                            </p>
                                          )}

                                          <Button
                                            type="submit"
                                            size="sm"
                                            disabled={savingReview === submission.id}
                                          >
                                            {savingReview === submission.id
                                              ? "Saving correction..."
                                              : submission.status === "reviewed"
                                                ? "Update correction"
                                                : "Save grade and feedback"}
                                          </Button>
                                        </form>
                                      </div>
                                    ))
                                  )}
                                </div>
                              ) : !userId ? (
                                <p className="mt-2 text-sm text-cova-mute">
                                  Sign in to submit your work.
                                </p>
                              ) : !enrolled ? (
                                <p className="mt-2 text-sm text-cova-mute">
                                  Enrol in this course before submitting the TP.
                                </p>
                              ) : mySubmission ? (
                                <div className="mt-3 space-y-3">
                                  <Badge
                                    tone={mySubmission.status === "reviewed" ? "soft" : "outline"}
                                  >
                                    {mySubmission.status === "reviewed"
                                      ? "Correction available"
                                      : "Awaiting correction"}
                                  </Badge>

                                  <p className="text-xs text-cova-mute">
                                    Submitted: {formatDate(mySubmission.submitted_at)}
                                  </p>

                                  <div>
                                    <p className="mb-1 text-sm font-medium">Your answer</p>
                                    <div className="whitespace-pre-wrap break-words rounded-lg bg-cova-soft/20 p-3 text-sm">
                                      {mySubmission.answer}
                                    </div>
                                  </div>

                                  {mySubmission.status === "reviewed" ? (
                                    <div className="rounded-lg border border-cova-line p-3">
                                      <p className="text-sm font-medium">Your grade</p>
                                      <p className="mt-1 text-2xl font-semibold">
                                        {mySubmission.grade ?? "—"}
                                        <span className="text-sm font-normal text-cova-mute">
                                          {" "}
                                          / 100
                                        </span>
                                      </p>

                                      <p className="mt-3 text-sm font-medium">Teacher feedback</p>
                                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-cova-mute">
                                        {mySubmission.feedback ||
                                          "No written feedback was provided."}
                                      </p>

                                      {mySubmission.reviewed_at && (
                                        <p className="mt-3 text-xs text-cova-mute">
                                          Reviewed: {formatDate(mySubmission.reviewed_at)}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-cova-mute">
                                      Your answer has been sent. You cannot change it while it is
                                      awaiting correction.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <form
                                  onSubmit={(event) => void handleSubmitTp(event, lesson)}
                                  className="mt-3 space-y-3"
                                >
                                  <label
                                    htmlFor={`answer-${lesson.id}`}
                                    className="block text-sm font-medium"
                                  >
                                    Your answer
                                  </label>
                                  <textarea
                                    id={`answer-${lesson.id}`}
                                    value={answers[lesson.id] ?? ""}
                                    onChange={(event) =>
                                      setAnswers((current) => ({
                                        ...current,
                                        [lesson.id]: event.target.value,
                                      }))
                                    }
                                    required
                                    maxLength={50000}
                                    rows={6}
                                    placeholder="Write your solution and explain your work..."
                                    className="w-full resize-y rounded-lg border border-cova-line bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cova-soft"
                                  />
                                  <p className="text-xs text-cova-mute">
                                    Maximum 50,000 characters. Check your answer before submitting.
                                  </p>
                                  <Button type="submit" disabled={savingSubmission === lesson.id}>
                                    {savingSubmission === lesson.id ? "Submitting..." : "Submit TP"}
                                  </Button>
                                </form>
                              )}
                            </div>
                          )}

                          {loading ? (
                            <p className="mt-3 text-xs text-cova-mute">Loading progress...</p>
                          ) : enrolled && !isOwner ? (
                            <Button
                              size="sm"
                              className="mt-3"
                              disabled={savingLesson === lesson.id}
                              variant={done ? "secondary" : "primary"}
                              onClick={() => void toggleLesson(lesson.id, done)}
                            >
                              {savingLesson === lesson.id
                                ? "Saving..."
                                : done
                                  ? "Mark as not done"
                                  : "Mark as complete"}
                            </Button>
                          ) : !enrolled && !isOwner ? (
                            <p className="mt-3 text-xs text-cova-mute">
                              Enrol in the course to track your progress.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-3 text-base font-semibold">
            Assignments
          </h2>

          <Card>
            <CardBody>
              {relatedAssignments.length === 0 ? (
                <p className="text-sm text-cova-mute">No assignments for this course yet.</p>
              ) : (
                <ul className="space-y-3">
                  {relatedAssignments.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/assignments/${a.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {a.title}
                      </Link>
                      <p className="text-xs text-cova-mute">
                        {dueLabel(a.due_at)} · {a.points} pts
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <Link
                href="/assignments"
                className="mt-4 inline-block text-sm font-medium underline-offset-2 hover:underline"
              >
                Open assignments
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
