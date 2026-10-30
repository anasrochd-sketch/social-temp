"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Play, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextAreaField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { challenges, type ChallengeContent, type ChallengeType } from "@/data/challenges";
import { getSupabase } from "@/lib/supabase/client";
import { demoActions, useDemoState } from "@/lib/demo-store";
import type { ChallengeKind, Difficulty } from "@/types";

const FILE_BUCKET = "challenge-files";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
type ChallengeView = { id: string; created_by?: string; title: string; description: string; kind: ChallengeKind; difficulty: Difficulty; points: number; minutes: number; exerciseType: ChallengeType; questions: ChallengeContent["questions"]; attachment_path?: string | null; attachment_name?: string | null; builtIn: boolean };
type Submission = { id: string; user_id: string; status: "in_progress" | "submitted"; answers: Array<number | number[]>; response_text: string; storage_path: string | null; file_name: string | null; score: number | null; submitted_at: string | null; file_url?: string };

export function ChallengeDetailView({ challengeId }: { challengeId: string }) {
  const { t, formatTag } = useI18n();
  const toast = useToast();
  const { completedChallenges } = useDemoState();
  const [challenge, setChallenge] = useState<ChallengeView | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [owner, setOwner] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [responses, setResponses] = useState<Submission[]>([]);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Array<number | number[]>>([]);
  const [response, setResponse] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setNotFound(false);
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);
      const builtin = challenges.find((item) => item.id === challengeId);
      let row: ChallengeView;
      if (builtin) {
        row = { ...builtin, kind: builtin.kind, exerciseType: builtin.exerciseType, builtIn: true };
        setOwner(false);
        setSubmission(completedChallenges.includes(builtin.id) ? { id: builtin.id, user_id: uid ?? "", status: "submitted", answers: [], response_text: "", storage_path: null, file_name: null, score: null, submitted_at: null } : null);
      } else {
        const { data, error } = await supabase.from("challenges").select("id,created_by,title,description,category,difficulty,points,minutes,exercise_type,questions,attachment_path,attachment_name").eq("id", challengeId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Challenge not found");
        const custom = data as { id: string; created_by: string; title: string; description: string; category: ChallengeKind; difficulty: Difficulty; points: number; minutes: number; exercise_type: ChallengeType; questions: ChallengeContent["questions"]; attachment_path: string | null; attachment_name: string | null };
        row = { ...custom, kind: custom.category, exerciseType: custom.exercise_type, builtIn: false };
        const isOwner = uid === custom.created_by;
        setOwner(isOwner);
        if (custom.attachment_path) {
          const { data: signed } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(custom.attachment_path, 600);
          setAttachmentUrl(signed?.signedUrl ?? null);
        } else setAttachmentUrl(null);
        if (isOwner) {
          const { data: entries, error: entriesError } = await supabase.from("challenge_submissions").select("id,user_id,status,answers,response_text,storage_path,file_name,score,submitted_at").eq("challenge_id", challengeId).order("submitted_at", { ascending: false });
          if (entriesError) throw entriesError;
          const withFiles = await Promise.all(((entries ?? []) as Submission[]).map(async (entry) => {
            if (!entry.storage_path) return entry;
            const { data: signed } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(entry.storage_path, 600);
            return { ...entry, file_url: signed?.signedUrl };
          }));
          setResponses(withFiles);
        } else if (uid) {
          const { data: mine, error: mineError } = await supabase.from("challenge_submissions").select("id,user_id,status,answers,response_text,storage_path,file_name,score,submitted_at").eq("challenge_id", challengeId).eq("user_id", uid).maybeSingle();
          if (mineError) throw mineError;
          setSubmission(mine as Submission | null);
          setAnswers((mine?.answers as Array<number | number[]>) ?? []);
          setResponse(mine?.response_text ?? "");
        }
      }
      setChallenge(row);
      setAnswers((current) => current.length ? current : row.questions.map((question) => {
        if (!Array.isArray(question.answer)) return -1;
        return question.choices?.map(() => 0) ?? [];
      }));
    } catch (error) {
      console.error("Unable to load challenge:", error); setNotFound(true);
    } finally { setLoading(false); }
  }, [challengeId, completedChallenges]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
  useEffect(() => { void load(); }, [load]);

  async function startChallenge() {
    if (!challenge || !userId || starting || submission) return;
    setStarting(true);
    try {
      if (!challenge.builtIn) {
        const { error } = await getSupabase().from("challenge_submissions").insert({ challenge_id: challenge.id, user_id: userId, status: "in_progress" });
        if (error) throw error;
      }
      setSubmission({ id: challenge.id, user_id: userId, status: "in_progress", answers: [], response_text: "", storage_path: null, file_name: null, score: null, submitted_at: null });
      toast.push(t("challenges.detail.started"));
    } catch (error) { console.error("Unable to start challenge:", error); toast.push(t("challenges.detail.startError")); }
    finally { setStarting(false); }
  }

  async function submitChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || !submission || submission.status !== "in_progress" || !userId || submitting) { toast.push(t("challenges.detail.startFirst")); return; }
    if (challenge.questions.some((question, index) => question.choices && (Array.isArray(question.answer) ? !Array.isArray(answers[index]) || (answers[index] as number[]).some((value) => value < 1) : typeof answers[index] !== "number" || answers[index] < 0))) { toast.push(t("challenges.questionsRequired")); return; }
    if (file && file.size > MAX_FILE_SIZE) { toast.push(t("challenges.fileTooLarge")); return; }
    if (["written","coding","file"].includes(challenge.exerciseType) && !response.trim() && !file) { toast.push(t("challenges.detail.submitError")); return; }
    setSubmitting(true);
    let storagePath: string | null = null;
    try {
      if (file && !challenge.builtIn) {
        const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        storagePath = `${challenge.id}/${userId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await getSupabase().storage.from(FILE_BUCKET).upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (error) throw error;
      }
      let score: number | null = null;
      if (challenge.builtIn) {
        const keyed = challenge.questions.filter((question) => question.answer !== undefined);
        if (keyed.length) {
          const correct = keyed.filter((question) => {
            const index = challenge.questions.indexOf(question);
            const answer = answers[index];
            if (Array.isArray(question.answer)) {
              const order = question.answer;
              return JSON.stringify(answer) === JSON.stringify(question.choices?.map((_, itemIndex) => order.indexOf(itemIndex) + 1));
            }
            return answer === question.answer;
          }).length;
          score = Math.round(challenge.points * correct / keyed.length);
        }
        if (!completedChallenges.includes(challenge.id)) demoActions.toggleChallenge(challenge.id);
      } else {
        const { data, error } = await getSupabase().rpc("submit_challenge", { p_challenge_id: challenge.id, p_answers: answers, p_response_text: response.trim(), p_storage_path: storagePath, p_file_name: file?.name ?? null });
        if (error) throw error;
        score = typeof data === "number" ? data : null;
      }
      setSubmission({ ...submission, status: "submitted", answers, response_text: response.trim(), storage_path: storagePath, file_name: file?.name ?? null, score, submitted_at: new Date().toISOString() });
      toast.push(t("challenges.detail.submitted"));
      if (!challenge.builtIn) await load();
    } catch (error) {
      console.error("Unable to submit challenge:", error);
      if (storagePath) await getSupabase().storage.from(FILE_BUCKET).remove([storagePath]);
      toast.push(t("challenges.detail.submitError"));
    } finally { setSubmitting(false); }
  }

  if (loading) return <Card><CardBody><p className="text-sm text-cova-mute">{t("assignments.loading")}</p></CardBody></Card>;
  if (notFound || !challenge) return <Card><CardBody><h1 className="text-xl font-semibold">{t("challenges.detail.notFound")}</h1></CardBody></Card>;
  const keyedQuestions = challenge.questions.filter((question) => question.answer !== undefined);
  const correctAnswers = keyedQuestions.filter((question) => {
    const index = challenge.questions.indexOf(question);
    if (Array.isArray(question.answer)) {
      const order = question.answer;
      return JSON.stringify(answers[index]) === JSON.stringify(question.choices?.map((_, itemIndex) => order.indexOf(itemIndex) + 1));
    }
    return answers[index] === question.answer;
  }).length;

  return <div className="space-y-5">
    <Link href="/challenges" className="inline-flex items-center gap-2 text-sm font-medium text-cova-mute hover:text-cova-ink"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("challenges.detail.back")}</Link>
    <Card><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex flex-wrap gap-2"><Badge tone="outline">{t(`challenges.kind.${challenge.kind.toLowerCase()}` as never)}</Badge><Badge tone="outline">{t(`challenges.difficulty.${challenge.difficulty.toLowerCase()}` as never)}</Badge><Badge tone="soft">{challenge.points} {t("challenges.points")}</Badge></div><h1 className="mt-3 text-2xl font-semibold">{challenge.title}</h1><p className="mt-2 text-sm text-cova-mute">{challenge.description}</p><p className="mt-3 text-xs text-cova-mute">{t(`challenges.type.${challenge.exerciseType}` as never)} · {challenge.minutes} {t("challenges.minutes")}</p></div>
      {!owner && !submission && <Button disabled={!userId || starting} onClick={() => void startChallenge()}><Play className="h-4 w-4" aria-hidden="true" />{starting ? t("coding.running") : t("challenges.detail.start")}</Button>}
      {owner && <Badge tone="soft">{t("challenges.detail.owner")}</Badge>}
      {!userId && <span className="text-sm text-cova-mute">{t("challenges.detail.signIn")}</span>}
      {submission?.status === "in_progress" && !owner && <Badge tone="outline">{t("assignments.status.in-progress")}</Badge>}
      {submission?.status === "submitted" && !owner && <Badge tone="soft">{t("assignments.status.submitted")}</Badge>}
    </CardBody></Card>
    {attachmentUrl && <Card><CardBody><a href={attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium underline"><Download className="h-4 w-4" aria-hidden="true" />{challenge.attachment_name || t("challenges.detail.attachment")}</a></CardBody></Card>}
    <Card><CardBody className="space-y-5">
      <h2 className="text-lg font-semibold">{t("challenges.exerciseType")}</h2>
      {challenge.questions.map((question, questionIndex) => <fieldset key={questionIndex} className="space-y-3 rounded-xl border border-cova-line p-4" disabled={owner || submission?.status === "submitted" || !submission}>
        <legend className="px-2 text-sm font-semibold">{question.prompt}</legend>
        {question.choices && challenge.exerciseType === "ordering" ? <div className="space-y-2">{question.choices.map((choice, choiceIndex) => ({ choice, choiceIndex })).reverse().map(({ choice, choiceIndex }) => {
          const answer = Array.isArray(answers[questionIndex]) ? answers[questionIndex] as number[] : [];
          return <label key={`${choiceIndex}-${choice}`} className="flex items-center gap-3 rounded-lg bg-cova-bg p-3 text-sm"><span className="flex-1">{choice}</span><select aria-label={`${choice} position`} value={answer[choiceIndex] || ""} onChange={(event) => setAnswers((current) => current.map((value, index) => index === questionIndex ? [...(Array.isArray(value) ? value : []),].map((position, itemIndex) => itemIndex === choiceIndex ? Number(event.target.value) : position) : value))} className="h-9 rounded-md border border-cova-line bg-white px-2"><option value="">—</option>{question.choices!.map((_, pos) => <option key={pos} value={pos + 1}>{pos + 1}</option>)}</select></label>;
        })}</div> : question.choices ? <div className="space-y-2">{question.choices.map((choice, choiceIndex) => <label key={`${choiceIndex}-${choice}`} className="flex items-center gap-3 rounded-lg bg-cova-bg p-3 text-sm"><input type="radio" name={`answer-${questionIndex}`} checked={answers[questionIndex] === choiceIndex} onChange={() => setAnswers((current) => current.map((value, index) => index === questionIndex ? choiceIndex : value))} className="h-4 w-4 accent-cova-muted" />{choice}</label>)}</div> : null}
      </fieldset>)}
      {["written","coding","file"].includes(challenge.exerciseType) && <TextAreaField id="challenge-response" label={t("challenges.detail.response")} placeholder={t("challenges.detail.responsePlaceholder")} rows={6} value={response} onChange={(event) => setResponse(event.target.value)} disabled={!submission || submission.status === "submitted" || owner} />}
      {(challenge.exerciseType === "file" || challenge.exerciseType === "coding" || challenge.exerciseType === "written") && !challenge.builtIn ? <div><label htmlFor="challenge-response-file" className="mb-1.5 block text-sm font-medium">{t("challenges.detail.fileResponse")}</label><input id="challenge-response-file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={!submission || submission.status === "submitted" || owner} className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5" />{file && <p className="mt-1 text-xs text-cova-mute">{file.name}</p>}</div> : null}
      {!owner && submission?.status === "in_progress" && <form onSubmit={(event) => void submitChallenge(event)}><Button type="submit" disabled={submitting}><Send className="h-4 w-4" aria-hidden="true" />{submitting ? t("challenges.detail.submitting") : t("challenges.detail.submit")}</Button></form>}
      {!owner && submission?.status === "submitted" && <div className="rounded-lg bg-cova-pale p-3 text-sm">{submission.score === null ? t("challenges.detail.manualGrade") : challenge.builtIn ? t("challenges.detail.correct", { count: correctAnswers, total: keyedQuestions.length, score: submission.score, points: challenge.points }) : t("challenges.detail.score", { score: `${submission.score}/${challenge.points}` })}</div>}
    </CardBody></Card>
    {owner && <Card><CardBody><h2 className="text-lg font-semibold">{t("challenges.detail.responses")}</h2>{responses.length === 0 ? <p className="mt-3 text-sm text-cova-mute">{t("challenges.detail.noResponses")}</p> : <ul className="mt-4 space-y-3">{responses.map((entry) => <li key={entry.id} className="rounded-xl border border-cova-line p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{t("challenges.detail.student")}</p><Badge tone={entry.status === "submitted" ? "soft" : "outline"}>{t(`assignments.status.${entry.status === "submitted" ? "submitted" : "in-progress"}` as never)}</Badge></div>{entry.submitted_at && <p className="mt-1 text-xs text-cova-mute">{new Date(entry.submitted_at).toLocaleString(formatTag)}</p>}{entry.response_text && <p className="mt-3 whitespace-pre-wrap text-sm">{entry.response_text}</p>}{entry.score !== null && <p className="mt-2 text-sm font-semibold">{t("challenges.detail.score", { score: `${entry.score}/${challenge.points}` })}</p>}{entry.file_url && <a href={entry.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm underline"><Download className="h-4 w-4" aria-hidden="true" />{entry.file_name || t("challenges.detail.fileResponse")}</a>}</li>)}</ul>}</CardBody></Card>}
  </div>;
}
