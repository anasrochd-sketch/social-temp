"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Award, Clock, FilePlus2, Plus, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter } from "@/components/ui/FormField";
import { Tabs } from "@/components/ui/Tabs";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { challenges, type ChallengeContent, type ChallengeType } from "@/data/challenges";
import { getSupabase } from "@/lib/supabase/client";
import { useDemoState } from "@/lib/demo-store";
import type { ChallengeKind, Difficulty } from "@/types";

const TABS = ["All", "Daily", "Weekly", "Coding", "Community"] as const;
const ALL = "Any difficulty";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const FILE_BUCKET = "challenge-files";
type ChallengeRow = { id: string; created_by: string; title: string; description: string; category: ChallengeKind; difficulty: Difficulty; points: number; minutes: number; exercise_type: ChallengeType; questions: ChallengeContent["questions"]; attachment_path: string | null; attachment_name: string | null; created_at: string };

export function ChallengesBoard() {
  const { t } = useI18n();
  const toast = useToast();
  const { completedChallenges } = useDemoState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [difficulty, setDifficulty] = useState(ALL);
  const [hideDone, setHideDone] = useState(false);
  const [customRows, setCustomRows] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ChallengeKind>("Coding");
  const [level, setLevel] = useState<Difficulty>("Easy");
  const [exerciseType, setExerciseType] = useState<ChallengeType>("quiz");
  const [points, setPoints] = useState(20);
  const [minutes, setMinutes] = useState(15);
  const [prompt, setPrompt] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [pairsText, setPairsText] = useState("");
  const [challengeFile, setChallengeFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? null);
      const { data, error } = await supabase.from("challenges")
        .select("id,created_by,title,description,category,difficulty,points,minutes,exercise_type,questions,attachment_path,attachment_name,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCustomRows((data ?? []) as ChallengeRow[]);
    } catch (error) {
      console.error("Unable to load community challenges:", error);
      setCustomRows([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
  useEffect(() => { void load(); }, [load]);

  const allRows = useMemo(() => [
    ...challenges,
    ...customRows.map((item) => ({ id: item.id, title: item.title, description: item.description, kind: item.category, difficulty: item.difficulty, points: item.points, minutes: item.minutes, exerciseType: item.exercise_type, questions: item.questions, createdBy: item.created_by, attachmentName: item.attachment_name })),
  ], [customRows]);
  const results = allRows.filter((item) => (tab === "All" || item.kind === tab) && (difficulty === ALL || item.difficulty === difficulty) && (!hideDone || !completedChallenges.includes(item.id)));
  const earned = challenges.filter((item) => completedChallenges.includes(item.id)).reduce((sum, item) => sum + item.points, 0);
  const tabsLabels = { All: t("challenges.filter.all"), Daily: t("challenges.kind.daily"), Weekly: t("challenges.kind.weekly"), Coding: t("challenges.kind.coding"), Community: t("challenges.kind.community") };
  const options = optionsText.split("\n").map((option) => option.trim()).filter(Boolean);

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("Coding"); setLevel("Easy"); setExerciseType("quiz"); setPoints(20); setMinutes(15); setPrompt(""); setOptionsText(""); setCorrectIndex(0); setPairsText(""); setChallengeFile(null);
  }

  async function createChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;
    if (challengeFile && challengeFile.size > MAX_FILE_SIZE) { toast.push(t("challenges.fileTooLarge")); return; }
    const questions: ChallengeContent["questions"] = [];
    const answerKey: Array<number | number[]> = [];
    if (exerciseType === "matching") {
      const pairs = pairsText.split("\n").reduce<[string, string][]>((result, line) => {
        const delimiter = line.indexOf("=>");
        if (delimiter < 0) return result;
        const left = line.slice(0, delimiter).trim();
        const right = line.slice(delimiter + 2).trim();
        if (left && right) result.push([left, right]);
        return result;
      }, []);
      if (pairs.length < 2) { toast.push(t("challenges.matchingHint")); return; }
      const rightItems = pairs.map((pair) => pair[1]);
      for (const [left, right] of pairs) { questions.push({ prompt: left, choices: rightItems }); answerKey.push(rightItems.indexOf(right)); }
    } else if (["quiz", "intruder", "ordering"].includes(exerciseType)) {
      if (!prompt.trim() || options.length < (exerciseType === "ordering" ? 2 : 2)) { toast.push(t("challenges.questionsRequired")); return; }
      questions.push({ prompt: prompt.trim(), choices: options });
      if (exerciseType === "ordering") answerKey.push(options.map((_, index) => index + 1));
      else {
        if (correctIndex < 0 || correctIndex >= options.length) { toast.push(t("challenges.questionsRequired")); return; }
        answerKey.push(correctIndex);
      }
    } else if (prompt.trim()) {
      questions.push({ prompt: prompt.trim() });
    }
    setSaving(true);
    const challengeId = crypto.randomUUID();
    let attachmentPath: string | null = null;
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("challenges").insert({
        id: challengeId, created_by: userId, title: title.trim(), description: description.trim(), category, difficulty: level,
        points, minutes, exercise_type: exerciseType, questions,
      });
      if (error) throw error;
      if (answerKey.length) {
        const { error: keyError } = await supabase.from("challenge_answer_keys").insert({ challenge_id: challengeId, answer_key: answerKey });
        if (keyError) throw keyError;
      }
      if (challengeFile) {
        const safeName = challengeFile.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        attachmentPath = `${challengeId}/${userId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(FILE_BUCKET).upload(attachmentPath, challengeFile, { contentType: challengeFile.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        const { error: updateError } = await supabase.from("challenges").update({ attachment_path: attachmentPath, attachment_name: challengeFile.name }).eq("id", challengeId);
        if (updateError) throw updateError;
      }
      toast.push(t("challenges.created"));
      setFormOpen(false); resetForm(); await load();
    } catch (error) {
      console.error("Unable to create challenge:", error);
      const supabase = getSupabase();
      if (attachmentPath) await supabase.storage.from(FILE_BUCKET).remove([attachmentPath]);
      await supabase.from("challenges").delete().eq("id", challengeId);
      toast.push(t("challenges.createError"));
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-lg bg-cova-pale px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>{t("challenges.progress", { completed: completedChallenges.length, total: challenges.length, points: earned })}</p>
        <div className="flex flex-wrap gap-2"><Link href="/assignments?create=1" className="inline-flex h-9 items-center justify-center rounded-lg border border-cova-line bg-white px-3 text-sm font-medium hover:bg-cova-pale">{t("challenges.createAssignment")}</Link><Button onClick={() => setFormOpen(true)} disabled={!userId}><Plus className="h-4 w-4" aria-hidden="true" />{t("challenges.createButton")}</Button></div>
      </div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label={t("challenges.filter.label")} labels={tabsLabels} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SelectFilter label={t("challenges.difficulty")} options={[ALL, "Easy", "Medium", "Hard"]} value={difficulty} onChange={(event) => setDifficulty(event.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} className="h-4 w-4 accent-cova-muted" />{t("challenges.hideCompleted")}</label>
        </div>
      </div>
      {loading ? <p className="rounded-xl border border-cova-line bg-white p-6 text-sm text-cova-mute">{t("assignments.loading")}</p> : loadError && results.length === 0 ? <EmptyState icon={SearchX} title={t("challenges.loadError")} description={t("challenges.migrationHint")} action={<Button variant="secondary" onClick={() => void load()}>{t("common.tryAgain")}</Button>} /> : results.length === 0 ? (
        <EmptyState icon={SearchX} title={t("challenges.emptyTitle")} description={t("challenges.emptyDescription")} action={<Button variant="secondary" onClick={() => { setTab("All"); setDifficulty(ALL); setHideDone(false); }}>{t("challenges.resetFilters")}</Button>} />
      ) : <>{loadError && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm">{t("challenges.migrationHint")}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((item) => <Card key={item.id} className="flex flex-col p-5">
          <div className="flex items-center justify-between"><Badge tone="outline">{t(`challenges.kind.${item.kind.toLowerCase()}` as never)}</Badge><Badge tone="soft">+{item.points} {t("challenges.points")}</Badge></div>
          <h2 className="mt-3 font-semibold">{item.title}</h2><p className="mt-1 flex-1 text-sm text-cova-mute">{item.description}</p>
          <p className="mt-4 flex flex-wrap items-center gap-4 text-xs text-cova-mute"><span>{t(`challenges.difficulty.${item.difficulty.toLowerCase()}` as never)}</span><span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{item.minutes} {t("challenges.minutes")}</span><span>{t(`challenges.type.${item.exerciseType}` as never)}</span></p>
          <Link href={`/challenges/${item.id}`} className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cova-line bg-white px-3 text-sm font-medium hover:bg-cova-pale"><Award className="h-4 w-4" aria-hidden="true" />{completedChallenges.includes(item.id) ? t("challenges.review") : t("challenges.open")}</Link>
        </Card>)}
      </div></>}

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={t("challenges.createTitle")} description={t("challenges.createDescription")}>
        <form onSubmit={(event) => void createChallenge(event)} className="space-y-4">
          <TextField id="challenge-title" label={t("challenges.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
          <TextAreaField id="challenge-description" label={t("challenges.descriptionLabel")} value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={10000} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">{t("challenges.category")}<select value={category} onChange={(event) => setCategory(event.target.value as ChallengeKind)} className="mt-1.5 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">{TABS.slice(1).map((item) => <option key={item} value={item}>{t(`challenges.kind.${item.toLowerCase()}` as never)}</option>)}</select></label>
            <label className="text-sm font-medium">{t("challenges.difficulty")}<select value={level} onChange={(event) => setLevel(event.target.value as Difficulty)} className="mt-1.5 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">{["Easy","Medium","Hard"].map((item) => <option key={item} value={item}>{t(`challenges.difficulty.${item.toLowerCase()}` as never)}</option>)}</select></label>
            <label className="text-sm font-medium">{t("challenges.exerciseType")}<select value={exerciseType} onChange={(event) => setExerciseType(event.target.value as ChallengeType)} className="mt-1.5 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">{(["quiz","matching","intruder","ordering","written","coding","file"] as const).map((item) => <option key={item} value={item}>{t(`challenges.type.${item}` as never)}</option>)}</select></label>
            <TextField id="challenge-points" label={t("challenges.pointsLabel")} type="number" min={1} max={1000} value={points} onChange={(event) => setPoints(Number(event.target.value))} required />
            <TextField id="challenge-minutes" label={t("challenges.durationLabel")} type="number" min={1} max={1440} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} required />
          </div>
          {exerciseType === "matching" ? <TextAreaField id="challenge-pairs" label={t("challenges.matchingPairs")} hint={t("challenges.matchingHint")} placeholder={t("challenges.matchingPlaceholder")} value={pairsText} onChange={(event) => setPairsText(event.target.value)} required /> : ["quiz","intruder","ordering"].includes(exerciseType) ? <>
            <TextAreaField id="challenge-prompt" label={t("challenges.questionLabel")} value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
            <TextAreaField id="challenge-options" label={exerciseType === "ordering" ? t("challenges.stepsLabel") : t("challenges.optionsLabel")} hint={exerciseType === "ordering" ? t("challenges.orderHint") : t("challenges.optionsHint")} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} required />
            {exerciseType !== "ordering" && <TextField id="challenge-correct" label={t("challenges.correctIndex")} type="number" min={1} max={Math.max(2, options.length)} value={correctIndex + 1} onChange={(event) => setCorrectIndex(Number(event.target.value) - 1)} required />}
          </> : <TextAreaField id="challenge-prompt" label={t("challenges.questionLabel")} value={prompt} onChange={(event) => setPrompt(event.target.value)} required />}
          <div><label htmlFor="challenge-attachment" className="mb-1.5 block text-sm font-medium">{t("challenges.fileLabel")}</label><input id="challenge-attachment" type="file" onChange={(event) => setChallengeFile(event.target.files?.[0] ?? null)} disabled={saving} className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5" /><p className="mt-1 text-xs text-cova-mute">{t("challenges.fileHint")}</p>{challengeFile && <p className="mt-1 text-xs text-cova-mute"><FilePlus2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{challengeFile.name}</p>}</div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={saving || !userId}>{saving ? t("challenges.creating") : t("challenges.createButton")}</Button></div>
          {!userId && <p className="text-sm text-cova-mute">{t("challenges.signInToCreate")}</p>}
        </form>
      </Modal>
    </>
  );
}
