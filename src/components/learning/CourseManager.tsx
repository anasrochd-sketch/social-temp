
"use client";

import { useState } from "react";
import { Plus, Trash2, BookOpen, Copy, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import type { LessonType } from "@/types";
import { useT } from "@/i18n/client";
import { resourceTypeLabel } from "@/lib/resource-types";

type ExistingResource = { id: string; title: string; type: string; category: string };

type LessonDraft = {
  title: string;
  type: LessonType;
  minutes: number;
  summary: string;
  content: string;
};

const emptyLesson = (): LessonDraft => ({
  title: "",
  type: "reading",
  minutes: 10,
  summary: "",
  content: "",
});

export function CourseManager() {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [category, setCategory] = useState("General");
  const [visibility, setVisibility] = useState("private");
  const [lessons, setLessons] = useState<LessonDraft[]>([emptyLesson()]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [availableResources, setAvailableResources] = useState<ExistingResource[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);

  async function loadResources() {
    try {
      const { data, error } = await getSupabase()
        .from("shared_resources")
        .select("id,title,type,category")
        .order("title");
      if (error) throw error;
      setAvailableResources((data ?? []) as ExistingResource[]);
    } catch (error) {
      console.error("Unable to load resources for course creation:", error);
      setAvailableResources([]);
    }
  }

  function updateLesson(index: number, changes: Partial<LessonDraft>) {
    setLessons((current) =>
      current.map((lesson, i) =>
        i === index ? { ...lesson, ...changes } : lesson,
      ),
    );
  }

  async function createCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInviteCode("");

    if (!title.trim()) {
      setMessage(t("courses.create.titleError"));
      return;
    }

    if (lessons.some((lesson) => !lesson.title.trim())) {
      setMessage(t("courses.create.lessonTitleError"));
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabase();
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!auth.user) throw new Error(t("courses.create.signInError"));

      const courseId = `course-${crypto.randomUUID()}`;

      const { error: courseError } = await supabase.from("courses").insert({
        id: courseId,
        title: title.trim(),
        description: description.trim(),
        level,
        category: category.trim() || "General",
        instructor:
          auth.user.user_metadata?.full_name ||
          auth.user.user_metadata?.name ||
          auth.user.email?.split("@")[0] ||
          "Student",
        tags: [],
        published: visibility === "public",
        created_by: auth.user.id,
      });

      if (courseError) throw courseError;

      const lessonRows = lessons.map((lesson, index) => ({
        id: `${courseId}-lesson-${index + 1}`,
        course_id: courseId,
        title: lesson.title.trim(),
        type: lesson.type,
        minutes: Math.max(1, Number(lesson.minutes) || 10),
        summary: lesson.summary.trim(),
        content: lesson.content.trim(),
        position: index + 1,
      }));

      const { error: lessonError } = await supabase
        .from("course_lessons")
        .insert(lessonRows);

      if (lessonError) {
        await supabase.from("courses").delete().eq("id", courseId);
        throw lessonError;
      }

      if (selectedResources.length > 0) {
        const { error: resourceLinkError } = await supabase
          .from("course_resources")
          .insert(selectedResources.map((resourceId) => ({
            course_id: courseId,
            resource_id: resourceId,
            added_by: auth.user.id,
          })));
        if (resourceLinkError) {
          await supabase.from("courses").delete().eq("id", courseId);
          throw resourceLinkError;
        }
      }

      if (visibility === "private") {
        const { data: code, error: inviteError } = await supabase.rpc(
          "create_course_invite_code",
          { p_course_id: courseId },
        );

        if (inviteError) {
          throw new Error(
            t("courses.create.inviteFailure"),
          );
        }

        setInviteCode(String(code));

        const { error: saveCodeError } = await supabase.rpc(
          "save_course_invite_code",
          { p_course_id: courseId, p_code: String(code) },
        );
        if (saveCodeError) throw new Error(t("courses.create.codeSaveError"));
      }

      setMessage(t("courses.create.success"));
      setTitle("");
      setDescription("");
      setLevel("Beginner");
      setCategory("General");
      setLessons([emptyLesson()]);
      setSelectedResources([]);
    } catch (error) {
      console.error("Course creation failed:", error);
      const knownMessage = error instanceof Error ? error.message : "";
      const translatedMessages = [
        t("courses.create.signInError"),
        t("courses.create.inviteFailure"),
        t("courses.create.codeSaveError"),
      ];
      setMessage(
        translatedMessages.includes(knownMessage)
          ? knownMessage
          : t("courses.create.failure"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            const opening = !isOpen;
            setIsOpen(opening);
            if (opening) void loadResources();
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {isOpen ? t("courses.close") : t("courses.create.button")}
        </Button>
      </div>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-cova-line p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-cova-soft p-2">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t("courses.create.title")}</h2>
              <p className="text-sm text-cova-mute">
                {t("courses.create.description")}
              </p>
            </div>
          </div>

          <form onSubmit={createCourse} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                {t("courses.create.courseTitle")}
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                  placeholder={t("courses.create.titlePlaceholder")}
                />
              </label>

              <label className="block text-sm font-medium">
                {t("courses.create.category")}
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                  placeholder={t("courses.create.categoryPlaceholder")}
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              {t("courses.create.descriptionLabel")}
              <textarea
                required
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                placeholder={t("courses.create.descriptionPlaceholder")}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                {t("courses.level")}
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                >
                  <option value="Beginner">{t("courses.level.beginner")}</option>
                  <option value="Intermediate">{t("courses.level.intermediate")}</option>
                  <option value="Advanced">{t("courses.level.advanced")}</option>
                </select>
              </label>

              <label className="block text-sm font-medium">
                {t("courses.create.access")}
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                >
                  <option value="private">{t("courses.create.private")}</option>
                  <option value="public">{t("courses.create.public")}</option>
                </select>
              </label>
            </div>

            <div className="space-y-4">
              <section className="space-y-2 rounded-lg border border-cova-line p-4">
                <div>
                  <h3 className="font-semibold">{t("courses.resources.title")}</h3>
                  <p className="text-sm text-cova-mute">{t("courses.resources.createHint")}</p>
                </div>
                {availableResources.length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("courses.resources.noneAvailable")}</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {availableResources.map((resource) => (
                      <label key={resource.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedResources.includes(resource.id)}
                          onChange={(event) => setSelectedResources((current) => event.target.checked
                            ? [...current, resource.id]
                            : current.filter((id) => id !== resource.id))}
                        />
                        <span>{resource.title}</span>
                        <span className="text-xs text-cova-mute">{resource.category} · {t(resourceTypeLabel(resource.type))}</span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{t("courses.lessons")}</h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setLessons((current) => [...current, emptyLesson()])
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("courses.create.addLesson")}
                </Button>
              </div>

              {lessons.map((lesson, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-lg border border-cova-line p-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      {t("courses.lessonNumber", { number: index + 1 })}
                    </h4>
                    {lessons.length > 1 && (
                      <button
                        type="button"
                        aria-label={t("courses.create.removeLesson", { number: index + 1 })}
                        onClick={() =>
                          setLessons((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        className="rounded p-1 text-cova-mute hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <label className="block text-sm font-medium">
                    {t("courses.create.lessonTitle")}
                    <input
                      required
                      value={lesson.title}
                      onChange={(event) =>
                        updateLesson(index, { title: event.target.value })
                      }
                      className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      placeholder={t("courses.create.lessonTitle")}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium">
                      Type
                      <select
                        value={lesson.type}
                        onChange={(event) =>
                          updateLesson(index, {
                            type: event.target.value as LessonType,
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      >
                        <option value="reading">{t("courses.lessonType.reading")}</option>
                        <option value="video">{t("courses.lessonType.video")}</option>
                        <option value="exercise">{t("courses.lessonType.exercise")}</option>
                      </select>
                    </label>

                    <label className="block text-sm font-medium">
                      {t("courses.create.duration")}
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={lesson.minutes}
                        onChange={(event) =>
                          updateLesson(index, {
                            minutes: Number(event.target.value),
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-medium">
                    {t("courses.create.summary")}
                    <textarea
                      value={lesson.summary}
                      onChange={(event) =>
                        updateLesson(index, { summary: event.target.value })
                      }
                      rows={2}
                      className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      placeholder={t("courses.create.summaryPlaceholder")}
                    />
                  </label>
                </div>
              ))}
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("courses.create.submitting")}
                </>
              ) : (
                t("courses.create.button")
              )}
            </Button>
          </form>

          {message && (
            <p role="status" className="mt-4 text-sm">
              {message}
            </p>
          )}

          {inviteCode && (
            <div className="mt-4 rounded-lg border border-cova-line p-4">
              <p className="font-semibold">{t("courses.yourInvitationCode")}</p>
              <p dir="ltr" className="my-2 font-mono text-2xl tracking-widest">
                {inviteCode}
              </p>
              <p className="mb-3 text-sm text-cova-mute">
                {t("courses.shareCode")}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteCode);
                    setMessage(t("courses.codeCopied"));
                  } catch {
                    setMessage(t("courses.codeCopyFailed"));
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("courses.copyCode")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
