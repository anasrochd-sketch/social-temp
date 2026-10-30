"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Code2, Download, FileText, Play, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextAreaField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import type { MessageKey } from "@/i18n/messages/en";
import type { ChallengeType } from "@/data/challenges";

const SUBMISSION_BUCKET = "assignment-submissions";
const ATTACHMENT_BUCKET = "assignment-attachments";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "image/png", "image/jpeg",
]);

type AssignmentRecord = {
  id: string;
  course_id: string;
  created_by: string;
  title: string;
  description: string;
  due_at: string;
  created_at: string;
  points: number;
  attachment_path: string | null;
  attachment_name: string | null;
  kind: "general" | "coding";
  exercise_type: ChallengeType | "mixed";
  questions: Array<{ prompt: string; choices?: string[]; type?: ChallengeType }>;
};
type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: "in_progress" | "submitted" | "graded";
  started_at: string;
  submitted_at: string | null;
  submission_text: string;
  storage_path: string | null;
  grade: number | null;
  feedback: string;
  answers: Array<string | number | number[]>;
};
type Participant = {
  student_id: string;
  submission_id: string | null;
  display_name: string | null;
  user_code: string | null;
  status: "todo" | "in_progress" | "submitted" | "graded";
  started_at: string | null;
  submitted_at: string | null;
  submission_text: string | null;
  storage_path: string | null;
  grade: number | null;
  feedback: string | null;
  file_url?: string;
  answers?: Array<string | number | number[]>;
};
type Status = "todo" | "in-progress" | "submitted" | "graded";
const STATUS_LABELS: Record<Status, MessageKey> = {
  todo: "assignments.status.todo",
  "in-progress": "assignments.status.in-progress",
  submitted: "assignments.status.submitted",
  graded: "assignments.status.graded",
};

function questionType(question: AssignmentRecord["questions"][number], fallback: AssignmentRecord["exercise_type"]): ChallengeType {
  return question.type ?? (fallback === "mixed" ? "written" : fallback);
}

function initialAnswers(questions: AssignmentRecord["questions"], fallback: AssignmentRecord["exercise_type"]): Array<string | number | number[]> {
  return questions.map((question) => question.choices?.length
    ? questionType(question, fallback) === "ordering" ? question.choices.map(() => 0) : -1
    : "");
}

export function AssignmentDetailView({ assignmentId }: { assignmentId: string }) {
  const { t, formatTag } = useI18n();
  const toast = useToast();
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [studentFileUrl, setStudentFileUrl] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsError, setParticipantsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState("");
  const [answers, setAnswers] = useState<Array<string | number | number[]>>([]);
  const [file, setFile] = useState<File | null>(null);
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [savingGrade, setSavingGrade] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const uid = authData.user?.id ?? null;
      setUserId(uid);

      const { data: row, error: assignmentError } = await supabase
        .from("assignments")
        .select("id,course_id,created_by,title,description,due_at,created_at,points,attachment_path,attachment_name,kind,exercise_type,questions")
        .eq("id", assignmentId)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!row) throw new Error("Assignment not found");
      const currentAssignment = row as AssignmentRecord;
      setAssignment(currentAssignment);
      if (currentAssignment.attachment_path) {
        const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET)
          .createSignedUrl(currentAssignment.attachment_path, 600, { download: currentAssignment.attachment_name ?? true });
        setAttachmentUrl(signed?.signedUrl ?? null);
      } else setAttachmentUrl(null);
      const owner = uid === currentAssignment.created_by;
      setIsOwner(owner);

      const { data: course } = await supabase.from("courses").select("title").eq("id", currentAssignment.course_id).maybeSingle();
      setCourseTitle(course?.title ?? "");

      if (owner) {
        setParticipantsError(false);
        const { data, error } = await supabase.rpc("get_assignment_participants", { p_assignment_id: assignmentId });
        if (error) {
          console.error("Unable to load assignment participants:", error);
          setParticipantsError(true);
          setParticipants([]);
        } else {
          const rows = (data ?? []) as Participant[];
          const { data: submissionAnswers } = await supabase.from("assignment_submissions").select("student_id,answers").eq("assignment_id", assignmentId);
          const answersByStudent = new Map(((submissionAnswers ?? []) as Array<{ student_id: string; answers: Array<number | number[]> }>).map((item) => [item.student_id, item.answers]));
          rows.forEach((item) => { item.answers = answersByStudent.get(item.student_id) ?? []; });
          const withFiles = await Promise.all(rows.map(async (participant) => {
            if (!participant.storage_path) return participant;
            const { data: signed } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(participant.storage_path, 600);
            return { ...participant, file_url: signed?.signedUrl };
          }));
          setParticipants(withFiles);
          setGrades(Object.fromEntries(withFiles.filter((item) => item.submission_id).map((item) => [item.submission_id!, item.grade === null ? "" : String(item.grade)])));
          setFeedback(Object.fromEntries(withFiles.filter((item) => item.submission_id).map((item) => [item.submission_id!, item.feedback ?? ""])));
        }
        setSubmission(null);
      } else if (uid) {
        const { data, error } = await supabase.from("assignment_submissions")
          .select("id,assignment_id,student_id,status,started_at,submitted_at,submission_text,storage_path,grade,feedback,answers")
          .eq("assignment_id", assignmentId).eq("student_id", uid).maybeSingle();
        if (error) throw error;
        const studentSubmission = data as Submission | null;
        setSubmission(studentSubmission);
        setResponse(studentSubmission?.submission_text ?? "");
        setAnswers(studentSubmission?.answers?.length ? studentSubmission.answers : initialAnswers(currentAssignment.questions, currentAssignment.exercise_type));
        if (studentSubmission?.storage_path) {
          const { data: signed } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(studentSubmission.storage_path, 600);
          setStudentFileUrl(signed?.signedUrl ?? null);
        } else setStudentFileUrl(null);
        setParticipants([]);
      } else {
        setSubmission(null);
        setParticipants([]);
      }
    } catch (error) {
      console.error("Unable to load assignment:", error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
  useEffect(() => { void load(); }, [load]);

  const deadlineOpen = assignment ? new Date(assignment.due_at).getTime() > now : false;
  const lateCutoff = assignment
    ? new Date(new Date(assignment.due_at).getTime() + Math.max(0, new Date(assignment.due_at).getTime() - new Date(assignment.created_at).getTime()))
    : null;
  const submissionWindowOpen = Boolean(lateCutoff && lateCutoff.getTime() > now);

  async function startAssignment() {
    if (!assignment || !userId || starting || !submissionWindowOpen) return;
    setStarting(true);
    try {
      const { data, error } = await getSupabase().from("assignment_submissions").insert({
        assignment_id: assignment.id,
        student_id: userId,
        status: "in_progress",
      }).select("id,assignment_id,student_id,status,started_at,submitted_at,submission_text,storage_path,grade,feedback,answers").single();
      if (error) throw error;
      setSubmission(data as Submission);
      setAnswers(initialAnswers(assignment.questions, assignment.exercise_type));
      toast.push(t("assignments.detail.startSuccess"));
    } catch (error) {
      console.error("Unable to start assignment:", error);
      toast.push(t("assignments.detail.startError"));
    } finally {
      setStarting(false);
    }
  }

  async function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment || !submission || submission.status !== "in_progress" || submitting) return;
    const answersComplete = assignment.questions.every((question, index) => {
      const answer = answers[index];
      if (question.choices?.length) return questionType(question, assignment.exercise_type) === "ordering"
        ? Array.isArray(answer) && answer.length === question.choices.length && answer.every((position) => position > 0)
        : typeof answer === "number" && answer >= 0;
      return questionType(question, assignment.exercise_type) === "file" ? Boolean(file || typeof answer === "string" && answer.trim()) : typeof answer === "string" && Boolean(answer.trim());
    });
    if (assignment.questions.length ? !answersComplete : !response.trim() && !file) { toast.push(t("assignments.detail.submitRequired")); return; }
    if (!submissionWindowOpen) {
      toast.push(t("assignments.detail.deadlineClosed"));
      return;
    }
    if (file && !ALLOWED_FILE_TYPES.has(file.type)) {
      toast.push(t("assignments.fileTypeError"));
      return;
    }
    if (file && file.size > MAX_FILE_SIZE) {
      toast.push(t("assignments.fileSizeError"));
      return;
    }

    setSubmitting(true);
    let storagePath: string | null = null;
    try {
      const supabase = getSupabase();
      if (file && userId) {
        const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        storagePath = `${userId}/${assignment.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(SUBMISSION_BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error } = await supabase.from("assignment_submissions").update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submission_text: response.trim(),
        storage_path: storagePath,
        answers,
      }).eq("id", submission.id);
      if (error) throw error;
      toast.push(t("assignments.detail.submitted"));
      await load();
    } catch (error) {
      console.error("Unable to submit assignment:", error);
      if (storagePath) await getSupabase().storage.from(SUBMISSION_BUCKET).remove([storagePath]).catch(() => undefined);
      toast.push(t("assignments.detail.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveGrade(event: FormEvent<HTMLFormElement>, participant: Participant) {
    event.preventDefault();
    if (!participant.submission_id || !assignment) return;
    const gradeText = grades[participant.submission_id] ?? "";
    const grade = Number(gradeText);
    if (gradeText === "" || !Number.isFinite(grade) || grade < 0 || grade > assignment.points) return;
    setSavingGrade(participant.submission_id);
    try {
      const { error } = await getSupabase().from("assignment_submissions").update({
        grade,
        feedback: feedback[participant.submission_id] ?? "",
        status: "graded",
      }).eq("id", participant.submission_id);
      if (error) throw error;
      toast.push(t("assignments.detail.gradeSaved"));
      await load();
    } catch (error) {
      console.error("Unable to grade assignment submission:", error);
      toast.push(t("assignments.detail.gradeError"));
    } finally {
      setSavingGrade(null);
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/assignments" className="inline-flex items-center gap-2 text-sm font-medium text-cova-mute hover:text-cova-ink"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("assignments.detail.back")}</Link>
      {loading ? <Card><CardBody><p className="text-sm text-cova-mute">{t("assignments.detail.loading")}</p></CardBody></Card> : notFound || !assignment ? (
        <Card><CardBody><h1 className="text-xl font-semibold">{t("assignments.detail.unavailable")}</h1><p className="mt-2 text-sm text-cova-mute">{t("assignments.detail.notFound")}</p></CardBody></Card>
      ) : (
        <>
          <Card><CardBody className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">{courseTitle}</Badge>
                <Badge tone={deadlineOpen ? "soft" : "pale"}>{deadlineOpen ? t("assignments.deadlineOpen") : t("assignments.deadlinePassed")}</Badge>
                <Badge tone="outline">{t(`challenges.type.${assignment.exercise_type}` as never)}</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold">{assignment.title}</h1>
              <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-cova-mute">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />{new Date(assignment.due_at).toLocaleString(formatTag)}</span>
                <span>{t("assignments.points", { points: assignment.points })}</span>
              </p>
            </div>
            {!isOwner && !submission && submissionWindowOpen && <Button disabled={starting || !userId} onClick={() => void startAssignment()}><Play className="h-4 w-4" aria-hidden="true" />{starting ? t("assignments.detail.starting") : t("assignments.detail.start")}</Button>}
            {!isOwner && assignment.kind === "coding" && <Link href={`/coding?assignmentId=${encodeURIComponent(assignment.id)}&assignmentTitle=${encodeURIComponent(assignment.title)}`} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-cova-line bg-white px-3 text-sm font-medium hover:bg-cova-pale"><Code2 className="h-4 w-4" aria-hidden="true" />{t("assignments.detail.openCodingLab")}</Link>}
            {!isOwner && submission?.status === "in_progress" && <Badge tone="soft">{t("assignments.status.in-progress")}</Badge>}
          </CardBody></Card>

          <Card><CardBody>
            <h2 className="text-lg font-semibold">{t("assignments.detail.instructions")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{assignment.description}</p>
            {assignment.questions.filter((question) => !question.choices?.length).map((question, index) => <p key={index} className="mt-3 rounded-lg bg-cova-pale p-3 text-sm font-medium">{question.prompt}</p>)}
            {attachmentUrl && <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cova-line bg-white px-3 py-2 text-sm font-medium hover:bg-cova-pale"><Download className="h-4 w-4" aria-hidden="true" />{assignment.attachment_name || t("assignments.detail.attachmentOpen")}</a>}
          </CardBody></Card>

          {!isOwner && !submission && <p className="text-sm text-cova-mute">{submissionWindowOpen ? deadlineOpen ? t("assignments.detail.startsAt") : t("assignments.detail.lateWindow") : t("assignments.detail.deadlineClosed")}</p>}
          {!isOwner && submission?.status === "in_progress" && (
            <Card><CardBody>
              <h2 className="text-lg font-semibold">{t("assignments.detail.submitTitle")}</h2>
              <p className="mt-1 text-sm text-cova-mute">{t("assignments.detail.submitHint")}</p>
              {!submissionWindowOpen && <p className="mt-3 rounded-lg bg-cova-pale p-3 text-sm">{t("assignments.detail.deadlineClosed")}</p>}
              {submissionWindowOpen && !deadlineOpen && <p className="mt-3 rounded-lg bg-cova-pale p-3 text-sm">{t("assignments.detail.lateWindow")}</p>}
              <form className="mt-4 space-y-4" onSubmit={(event) => void submitWork(event)}>
                {assignment.questions.map((question, questionIndex) => {
                  const type = questionType(question, assignment.exercise_type);
                  if (!question.choices?.length) return <TextAreaField key={questionIndex} id={`assignment-exercise-answer-${questionIndex}`} label={question.prompt} value={typeof answers[questionIndex] === "string" ? answers[questionIndex] as string : ""} onChange={(event) => setAnswers((current) => current.map((value, index) => index === questionIndex ? event.target.value : value))} rows={4} maxLength={50000} disabled={!submissionWindowOpen || submitting} />;
                  return <fieldset key={questionIndex} disabled={!submissionWindowOpen || submitting} className="space-y-3 rounded-xl border border-cova-line p-4"><legend className="px-2 text-sm font-semibold">{question.prompt}</legend>
                    {type === "ordering" ? <div className="space-y-2">{question.choices.map((choice, choiceIndex) => ({ choice, choiceIndex })).reverse().map(({ choice, choiceIndex }) => {
                      const positions = Array.isArray(answers[questionIndex]) ? answers[questionIndex] as number[] : [];
                      return <label key={choiceIndex} className="flex items-center gap-3 rounded-lg bg-cova-bg p-3 text-sm"><span className="flex-1">{choice}</span><select aria-label={`${choice} position`} value={positions[choiceIndex] || ""} onChange={(event) => setAnswers((current) => current.map((value, index) => index === questionIndex ? (Array.isArray(value) ? value.map((position, itemIndex) => itemIndex === choiceIndex ? Number(event.target.value) : position) : []) : value))} className="h-9 rounded-md border border-cova-line bg-white px-2"><option value="">—</option>{question.choices!.map((_, position) => <option key={position} value={position + 1}>{position + 1}</option>)}</select></label>;
                    })}</div> : <div className="space-y-2">{question.choices.map((choice, choiceIndex) => <label key={choiceIndex} className="flex items-center gap-3 rounded-lg bg-cova-bg p-3 text-sm"><input type="radio" name={`assignment-answer-${questionIndex}`} checked={answers[questionIndex] === choiceIndex} onChange={() => setAnswers((current) => current.map((value, index) => index === questionIndex ? choiceIndex : value))} className="h-4 w-4 accent-cova-muted" />{choice}</label>)}</div>}
                  </fieldset>;
                })}
                <TextAreaField id="assignment-response" label={t("assignments.detail.responseLabel")} placeholder={t("assignments.detail.responsePlaceholder")} value={response} onChange={(event) => setResponse(event.target.value)} maxLength={50000} disabled={!submissionWindowOpen || submitting} />
                <div>
                  <label htmlFor="assignment-file" className="mb-1.5 block text-sm font-medium">{t("assignments.detail.fileLabel")}</label>
                  <input id="assignment-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={!submissionWindowOpen || submitting} className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5" />
                  <p className="mt-1 text-xs text-cova-mute">{t("assignments.detail.fileHint")}</p>
                </div>
                <Button type="submit" disabled={!submissionWindowOpen || submitting}><Send className="h-4 w-4" aria-hidden="true" />{submitting ? t("assignments.detail.submitting") : t("assignments.detail.submit")}</Button>
              </form>
            </CardBody></Card>
          )}

          {!isOwner && submission && submission.status !== "in_progress" && (
            <Card><CardBody className="space-y-4">
              <Badge tone="soft">{t(STATUS_LABELS[submission.grade !== null || submission.status === "graded" ? "graded" : "submitted"])}</Badge>
              <p className="text-sm text-cova-mute">{t("assignments.detail.submittedAt", { date: submission.submitted_at ? new Date(submission.submitted_at).toLocaleString(formatTag) : "" })}</p>
              {submission.submission_text && <div><h2 className="font-semibold">{t("assignments.detail.responseLabel")}</h2><p className="mt-2 whitespace-pre-wrap text-sm">{submission.submission_text}</p></div>}
              {studentFileUrl && <a href={studentFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium underline"><FileText className="h-4 w-4" aria-hidden="true" />{t("assignments.detail.fileOpen")}</a>}
              {submission.grade !== null && <div className="rounded-xl border border-cova-line p-4"><h2 className="font-semibold">{t("assignments.detail.grade")}</h2><p className="mt-1 text-2xl font-semibold">{submission.grade} / {assignment.points}</p><h3 className="mt-4 text-sm font-semibold">{t("assignments.detail.feedback")}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-cova-mute">{submission.feedback || t("assignments.detail.noFeedback")}</p></div>}
            </CardBody></Card>
          )}

          {isOwner && <Card><CardBody>
            <h2 className="text-lg font-semibold">{t("assignments.detail.participants")}</h2>
            <p className="mt-1 text-sm text-cova-mute">{t("assignments.detail.participantsHint")}</p>
            {participantsError ? <p role="alert" className="mt-4 text-sm text-red-700">{t("assignments.detail.participantsError")}</p> : participants.length === 0 ? <p className="mt-4 text-sm text-cova-mute">{t("assignments.detail.noParticipants")}</p> : (
              <ul className="mt-4 space-y-4">
                {participants.map((participant) => (
                  <li key={participant.student_id} className="rounded-xl border border-cova-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-semibold">{participant.display_name || participant.user_code || t("assignments.detail.notStarted")}</h3>{participant.user_code && <p className="text-xs text-cova-mute">{t("assignments.detail.studentCode", { code: participant.user_code })}</p>}</div>
                      <Badge tone={participant.status === "graded" ? "soft" : "outline"}>{participant.status === "todo" ? t("assignments.detail.notStarted") : t(STATUS_LABELS[participant.status === "in_progress" ? "in-progress" : participant.status])}</Badge>
                    </div>
                    {participant.started_at && <p className="mt-2 text-xs text-cova-mute">{t("assignments.detail.startedAt", { date: new Date(participant.started_at).toLocaleString(formatTag) })}</p>}
                    {participant.status === "todo" ? <p className="mt-3 text-sm text-cova-mute">{t("assignments.detail.noResponse")}</p> : (
                      <div className="mt-3 space-y-3">
                        {participant.submitted_at && <p className="text-xs text-cova-mute">{t("assignments.detail.submittedAt", { date: new Date(participant.submitted_at).toLocaleString(formatTag) })}</p>}
                        {participant.submission_text ? <div><h4 className="text-sm font-medium">{t("assignments.detail.studentResponse")}</h4><p className="mt-1 whitespace-pre-wrap rounded-lg bg-cova-pale p-3 text-sm">{participant.submission_text}</p></div> : <p className="text-sm text-cova-mute">{t("assignments.detail.noResponse")}</p>}
                        {assignment.questions.map((question, questionIndex) => {
                          const answer = participant.answers?.[questionIndex];
                          const rendered = Array.isArray(answer)
                            ? question.choices?.map((choice, choiceIndex) => `${choice} → ${answer[choiceIndex] || "—"}`).join("\n") ?? ""
                            : typeof answer === "number" && answer >= 0 ? question.choices?.[answer] ?? "" : typeof answer === "string" ? answer : "";
                          return <div key={questionIndex}><h4 className="text-sm font-medium">{question.prompt}</h4><p className="mt-1 whitespace-pre-wrap rounded-lg bg-cova-pale p-3 text-sm">{rendered || t("assignments.detail.noResponse")}</p></div>;
                        })}
                        {participant.file_url && <a href={participant.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium underline"><Download className="h-4 w-4" aria-hidden="true" />{participant.storage_path?.split("/").at(-1)}</a>}
                        {participant.submission_id && (participant.status === "submitted" || participant.status === "graded") && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void saveGrade(event, participant)}>
                          <div><label htmlFor={`grade-${participant.submission_id}`} className="mb-1.5 block text-sm font-medium">{t("assignments.detail.gradeLabel", { points: assignment.points })}</label><input id={`grade-${participant.submission_id}`} type="number" min={0} max={assignment.points} step="0.01" required value={grades[participant.submission_id] ?? ""} onChange={(event) => setGrades((current) => ({ ...current, [participant.submission_id!]: event.target.value }))} className="h-10 w-full rounded-lg border border-cova-line px-3 text-sm" /></div>
                          <div><label htmlFor={`feedback-${participant.submission_id}`} className="mb-1.5 block text-sm font-medium">{t("assignments.detail.feedbackLabel")}</label><input id={`feedback-${participant.submission_id}`} value={feedback[participant.submission_id] ?? ""} onChange={(event) => setFeedback((current) => ({ ...current, [participant.submission_id!]: event.target.value }))} placeholder={t("assignments.detail.feedbackPlaceholder")} className="h-10 w-full rounded-lg border border-cova-line px-3 text-sm" /></div>
                          <Button type="submit" disabled={savingGrade === participant.submission_id} className="sm:col-span-2">{savingGrade === participant.submission_id ? t("assignments.detail.savingGrade") : t("assignments.detail.saveGrade")}</Button>
                        </form>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody></Card>}
        </>
      )}
    </div>
  );
}
