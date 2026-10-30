"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, Paperclip, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { matchesQuery } from "@/lib/utils";
import type { ChallengeQuestion, ChallengeType } from "@/data/challenges";

const TABS = ["All", "To do", "In progress", "Submitted", "Graded"] as const;
const ATTACHMENT_BUCKET = "assignment-attachments";
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
type AssignmentTab = (typeof TABS)[number];
type Status = "todo" | "in-progress" | "submitted" | "graded";
type ExerciseBlock = { id: string; type: ChallengeType; prompt: string; optionsText: string; correctIndex: number; pairsText: string };
type AssignmentExerciseQuestion = ChallengeQuestion & { type: ChallengeType };
type AssignmentRow = {
  id: string;
  title: string;
  course_id: string;
  created_by: string;
  description: string;
  due_at: string;
  points: number;
  kind: "general" | "coding";
};
type SubmissionRow = { assignment_id: string; status: "in_progress" | "submitted" | "graded"; grade: number | null };
type CourseRow = { id: string; title: string };
type AssignmentItem = AssignmentRow & { courseTitle: string; status: Status; grade: number | null; isOwner: boolean };

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AssignmentsBoard() {
  const { t, formatTag } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<AssignmentTab>("All");
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [points, setPoints] = useState(100);
  const [exercises, setExercises] = useState<ExerciseBlock[]>([{ id: "exercise-1", type: "written", prompt: "", optionsText: "", correctIndex: 0, pairsText: "" }]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const currentUserId = authData.user?.id ?? null;
      setUserId(currentUserId);
      if (!currentUserId) {
        setRows([]);
        return;
      }

      const [{ data: assignments, error: assignmentsError }, { data: submissions, error: submissionsError }] = await Promise.all([
        supabase.from("assignments").select("id,title,course_id,created_by,description,due_at,points,kind").order("due_at"),
        supabase.from("assignment_submissions").select("assignment_id,status,grade").eq("student_id", currentUserId),
      ]);
      if (assignmentsError) throw assignmentsError;
      if (submissionsError) throw submissionsError;
      const assignmentRows = (assignments ?? []) as AssignmentRow[];
      const courseIds = [...new Set(assignmentRows.map((item) => item.course_id))];
      const coursesResult = courseIds.length
        ? await supabase.from("courses").select("id,title").in("id", courseIds)
        : { data: [], error: null };
      if (coursesResult.error) throw coursesResult.error;
      const courseTitles = new Map(((coursesResult.data ?? []) as CourseRow[]).map((course) => [course.id, course.title]));
      const submissionByAssignment = new Map(((submissions ?? []) as SubmissionRow[]).map((submission) => [submission.assignment_id, submission]));
      setRows(assignmentRows.map((assignment) => {
        const submission = submissionByAssignment.get(assignment.id);
        const isOwner = assignment.created_by === currentUserId;
        const status: Status = isOwner ? "todo" : submission?.status === "graded" || submission?.grade !== null && submission?.grade !== undefined
          ? "graded"
          : submission?.status === "submitted" ? "submitted"
            : submission?.status === "in_progress" ? "in-progress" : "todo";
        return { ...assignment, courseTitle: courseTitles.get(assignment.course_id) ?? "", status, grade: submission?.grade ?? null, isOwner };
      }));
    } catch (error) {
      console.error("Unable to load assignments:", error);
      setLoadError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("create") === "1") void openCreateForm();
  }, []);

  async function openCreateForm() {
    setFormOpen(true);
    try {
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data, error } = await supabase.from("courses").select("id,title").eq("created_by", authData.user.id).order("title");
      if (error) throw error;
      setCourses((data ?? []) as CourseRow[]);
    } catch (error) {
      console.error("Unable to load courses for assignment creation:", error);
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !userId) return;
    if (!new Date(dueAt).getTime() || new Date(dueAt).getTime() <= Date.now()) {
      toast.push(t("assignments.deadlineFutureError"));
      return;
    }
    if (attachment && attachment.size > MAX_ATTACHMENT_SIZE) {
      toast.push(t("assignments.fileSizeError"));
      return;
    }
    const questions: AssignmentExerciseQuestion[] = [];
    const answerKey: Array<number | number[] | null> = [];
    for (const exercise of exercises) {
      if (exercise.type === "matching") {
        const pairs = exercise.pairsText.split("\n").reduce<[string, string][]>((result, line) => {
          const delimiter = line.indexOf("=>");
          if (delimiter < 0) return result;
          const left = line.slice(0, delimiter).trim(); const right = line.slice(delimiter + 2).trim();
          if (left && right) result.push([left, right]);
          return result;
        }, []);
        if (pairs.length < 2) { toast.push(t("challenges.matchingHint")); return; }
        const rightItems = pairs.map((pair) => pair[1]);
        for (const [left, right] of pairs) { questions.push({ type: exercise.type, prompt: left, choices: rightItems }); answerKey.push(rightItems.indexOf(right)); }
      } else if (["quiz", "intruder", "ordering"].includes(exercise.type)) {
        const choices = exercise.optionsText.split("\n").map((option) => option.trim()).filter(Boolean);
        if (!exercise.prompt.trim() || choices.length < 2 || exercise.type !== "ordering" && (exercise.correctIndex < 0 || exercise.correctIndex >= choices.length)) { toast.push(t("challenges.questionsRequired")); return; }
        questions.push({ type: exercise.type, prompt: exercise.prompt.trim(), choices });
        answerKey.push(exercise.type === "ordering" ? choices.map((_, index) => index + 1) : exercise.correctIndex);
      } else {
        if (!exercise.prompt.trim()) { toast.push(t("challenges.questionsRequired")); return; }
        questions.push({ type: exercise.type, prompt: exercise.prompt.trim() });
        answerKey.push(null);
      }
    }
    const exerciseTypes = [...new Set(exercises.map((exercise) => exercise.type))];
    const assignmentType = exerciseTypes.length === 1 ? exerciseTypes[0] : "mixed";
    setSaving(true);
    const assignmentId = crypto.randomUUID();
    let attachmentPath: string | null = null;
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("assignments").insert({
        id: assignmentId,
        course_id: courseId,
        created_by: userId,
        title: title.trim(),
        description: description.trim(),
        due_at: new Date(dueAt).toISOString(),
        points,
        kind: exerciseTypes.includes("coding") ? "coding" : "general",
        exercise_type: assignmentType,
        questions,
      });
      if (error) throw error;
      if (answerKey.some((answer) => answer !== null)) {
        const { error: keyError } = await supabase.from("assignment_answer_keys").insert({ assignment_id: assignmentId, answer_key: answerKey });
        if (keyError) throw keyError;
      }
      if (attachment) {
        const safeName = attachment.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        attachmentPath = `${userId}/${assignmentId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET)
          .upload(attachmentPath, attachment, { contentType: attachment.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        const { error: updateError } = await supabase.from("assignments").update({
          attachment_path: attachmentPath,
          attachment_name: attachment.name,
        }).eq("id", assignmentId);
        if (updateError) throw updateError;
      }
      toast.push(t("assignments.createSuccess"));
      setFormOpen(false);
      setTitle("");
      setCourseId("");
      setDescription("");
      setDueAt("");
      setPoints(100);
      setExercises([{ id: "exercise-1", type: "written", prompt: "", optionsText: "", correctIndex: 0, pairsText: "" }]);
      setAttachment(null);
      await loadAssignments();
    } catch (error) {
      console.error("Unable to create assignment:", error);
      const supabase = getSupabase();
      if (attachmentPath) await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachmentPath]);
      await supabase.from("assignments").delete().eq("id", assignmentId);
      toast.push(t("assignments.createError"));
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => {
    const count: Record<AssignmentTab, number> = { All: rows.length, "To do": 0, "In progress": 0, Submitted: 0, Graded: 0 };
    rows.filter((row) => !row.isOwner).forEach((row) => {
      if (row.status === "todo") count["To do"] += 1;
      else if (row.status === "in-progress") count["In progress"] += 1;
      else if (row.status === "submitted") count.Submitted += 1;
      else count.Graded += 1;
    });
    return count;
  }, [rows]);

  const filtered = rows.filter((row) => {
    const matchesTab = tab === "All" || (!row.isOwner && row.status === (tab === "To do" ? "todo" : tab === "In progress" ? "in-progress" : tab.toLowerCase()));
    return matchesTab && matchesQuery(query, row.title, row.description, row.courseTitle);
  });
  const tabsLabels: Partial<Record<AssignmentTab, string>> = {
    All: t("assignments.filter.all"),
    "To do": t("assignments.filter.todo"),
    "In progress": t("assignments.filter.inProgress"),
    Submitted: t("assignments.filter.submitted"),
    Graded: t("assignments.filter.graded"),
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label={t("assignments.filter.label")} counts={counts} labels={tabsLabels} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput label={t("assignments.searchLabel")} placeholder={t("assignments.searchPlaceholder")} value={query} onChange={setQuery} className="lg:w-72" />
          <Button onClick={() => void openCreateForm()}><Plus className="h-4 w-4" aria-hidden="true" />{t("assignments.create.button")}</Button>
        </div>
      </div>

      {loading ? <p className="rounded-xl border border-cova-line bg-white p-6 text-sm text-cova-mute">{t("assignments.loading")}</p> : loadError ? (
        <EmptyState icon={ClipboardList} title={t("assignments.loadError")} description={t("assignments.loadErrorDescription")} action={<Button variant="secondary" onClick={() => void loadAssignments()}>{t("common.tryAgain")}</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("assignments.emptyTitle")} description={query ? t("assignments.emptySearch") : t("assignments.emptyDescription")} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((assignment) => (
            <li key={assignment.id}>
              <Card><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold"><Link href={`/assignments/${assignment.id}`} className="hover:underline">{assignment.title}</Link></h2>
                    <Badge tone={assignment.isOwner ? "soft" : assignment.status === "graded" ? "soft" : "pale"}>{assignment.isOwner ? t("assignments.createdByYou") : t(`assignments.status.${assignment.status}` as never)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-cova-mute">{assignment.courseTitle}</p>
                  <p className="mt-2 line-clamp-2 text-sm">{assignment.description}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cova-mute">
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{new Date(assignment.due_at).toLocaleString(formatTag)} · {new Date(assignment.due_at).getTime() <= Date.now() ? t("assignments.deadlinePassed") : t("assignments.deadlineOpen")}</span>
                    <span>{t("assignments.points", { points: assignment.points })}</span>
                    {assignment.status === "graded" && assignment.grade !== null && <span className="font-medium text-cova-ink">{t("assignments.grade", { grade: assignment.grade, points: assignment.points })}</span>}
                  </p>
                </div>
                <Link href={`/assignments/${assignment.id}`} className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-cova-line bg-white px-3 text-sm font-medium hover:bg-cova-pale">{assignment.isOwner ? t("assignments.openManagement") : t("assignments.openAssignment")}</Link>
              </CardBody></Card>
            </li>
          ))}
        </ul>
      )}

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={t("assignments.create.title")} description={t("assignments.create.description")}>
        <form onSubmit={(event) => void createAssignment(event)} className="space-y-4">
          <TextField id="assignment-title" label={t("assignments.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
          <div>
            <label htmlFor="assignment-course" className="mb-1.5 block text-sm font-medium">{t("assignments.courseLabel")}</label>
            <select id="assignment-course" value={courseId} onChange={(event) => setCourseId(event.target.value)} required className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
              <option value="">{t("assignments.coursePlaceholder")}</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </div>
          <TextAreaField id="assignment-description" label={t("assignments.instructionsLabel")} value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={10000} />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("assignments.create.exercises")}</h3>
            {exercises.map((exercise, index) => {
              const choices = exercise.optionsText.split("\n").filter((line) => line.trim());
              const updateExercise = (patch: Partial<ExerciseBlock>) => setExercises((current) => current.map((item) => item.id === exercise.id ? { ...item, ...patch } : item));
              return <div key={exercise.id} className="space-y-3 rounded-xl border border-cova-line p-4">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{t("assignments.create.exerciseNumber", { number: index + 1 })}</p>{exercises.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))} aria-label={t("assignments.create.removeExercise")}><Trash2 className="h-4 w-4" aria-hidden="true" />{t("assignments.create.removeExercise")}</Button>}</div>
                <label className="block text-sm font-medium">{t("challenges.exerciseType")}<select value={exercise.type} onChange={(event) => updateExercise({ type: event.target.value as ChallengeType })} className="mt-1.5 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">{(["quiz","matching","intruder","ordering","written","coding","file"] as const).map((item) => <option key={item} value={item}>{t(`challenges.type.${item}` as never)}</option>)}</select></label>
                {exercise.type === "matching" ? <TextAreaField id={`${exercise.id}-pairs`} label={t("challenges.matchingPairs")} hint={t("challenges.matchingHint")} placeholder={t("challenges.matchingPlaceholder")} value={exercise.pairsText} onChange={(event) => updateExercise({ pairsText: event.target.value })} required /> : <TextAreaField id={`${exercise.id}-prompt`} label={t("challenges.questionLabel")} value={exercise.prompt} onChange={(event) => updateExercise({ prompt: event.target.value })} required />}
                {["quiz","intruder","ordering"].includes(exercise.type) && <>
                  <TextAreaField id={`${exercise.id}-options`} label={exercise.type === "ordering" ? t("challenges.stepsLabel") : t("challenges.optionsLabel")} hint={exercise.type === "ordering" ? t("challenges.orderHint") : t("challenges.optionsHint")} value={exercise.optionsText} onChange={(event) => updateExercise({ optionsText: event.target.value })} required />
                  {exercise.type !== "ordering" && <TextField id={`${exercise.id}-correct`} label={t("challenges.correctIndex")} type="number" min={1} max={Math.max(2, choices.length)} value={exercise.correctIndex + 1} onChange={(event) => updateExercise({ correctIndex: Number(event.target.value) - 1 })} required />}
                </>}
              </div>;
            })}
            <Button type="button" variant="secondary" onClick={() => setExercises((current) => [...current, { id: crypto.randomUUID(), type: "written", prompt: "", optionsText: "", correctIndex: 0, pairsText: "" }])}><Plus className="h-4 w-4" aria-hidden="true" />{t("assignments.create.addExercise")}</Button>
          </div>
          <div>
            <label htmlFor="assignment-attachment" className="mb-1.5 block text-sm font-medium">{t("assignments.create.attachmentLabel")}</label>
            <input id="assignment-attachment" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} disabled={saving} className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5" />
            <p className="mt-1 text-xs text-cova-mute">{t("assignments.create.attachmentHint")}</p>
            {attachment && <p className="mt-1 flex items-center gap-1 text-xs text-cova-mute"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{attachment.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="assignment-deadline" type="datetime-local" label={t("assignments.deadlineLabel")} value={dueAt} onChange={(event) => setDueAt(event.target.value)} required min={localDateTimeValue(new Date(Date.now() + 60_000))} />
            <TextField id="assignment-points" type="number" label={t("assignments.pointsLabel")} value={points} onChange={(event) => setPoints(Number(event.target.value))} min={1} max={10000} required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" disabled={saving} onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={saving || courses.length === 0}>{saving ? t("assignments.create.submitting") : t("assignments.create.button")}</Button>
          </div>
          {courses.length === 0 && <p className="text-sm text-cova-mute">{t("assignments.noOwnedCourses")}</p>}
        </form>
      </Modal>
    </>
  );
}
