"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, Flame, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "@/components/dashboard/StatCard";
import { ContinueLearning } from "@/components/dashboard/ContinueLearning";
import { UpcomingAssignments } from "@/components/dashboard/UpcomingAssignments";
import { DailyChallengeCard } from "@/components/dashboard/DailyChallengeCard";
import { SuggestedGroups } from "@/components/dashboard/SuggestedGroups";
import { useDemoState } from "@/lib/demo-store";
import { levelFor } from "@/lib/progress";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/client";

type RealProfile = {
  id: string;
  user_code: string | null;
  display_name: string | null;
  xp: number | null;
};

type LeaderboardEntry = {
  user_code: string | null;
  rank: number | null;
};

export function DashboardView() {
  const { t, formatTag } = useI18n();
  const state = useDemoState();

  const [profile, setProfile] = useState<RealProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  // Données réelles de progression provenant de Supabase.
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>([]);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [learningLoading, setLearningLoading] = useState(true);
  const [challengesDone, setChallengesDone] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const supabase = getSupabase();

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          if (active) setProfile(null);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, user_code, display_name, xp")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (error) throw error;

        if (active) {
          setProfile(data as RealProfile | null);
        }
      } catch (error) {
        console.error("Erreur de chargement du profil :", error);
      } finally {
        if (active) setProfileLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  // Charge les inscriptions et les leçons terminées depuis Supabase.
  useEffect(() => {
    let active = true;

    async function loadLearningProgress() {
      setLearningLoading(true);

      try {
        const supabase = getSupabase();

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          if (active) {
            setEnrolledCourses([]);
            setCompletedLessons([]);
          }
          return;
        }

        const userId = authData.user.id;

        const [enrollmentResult, lessonResult] = await Promise.all([
          supabase
            .from("course_enrollments")
            .select("course_id")
            .eq("user_id", userId),

          supabase
            .from("lesson_completions")
            .select("lesson_id")
            .eq("user_id", userId),
        ]);

        if (enrollmentResult.error) throw enrollmentResult.error;
        if (lessonResult.error) throw lessonResult.error;

        const challengesResult = await supabase
          .from("challenge_submissions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "submitted");

        if (challengesResult.error) throw challengesResult.error;

        if (active) {
          setEnrolledCourses(
            (enrollmentResult.data ?? []).map((row) => row.course_id),
          );

          setCompletedLessons(
            (lessonResult.data ?? []).map((row) => row.lesson_id),
          );

          setChallengesDone(challengesResult.count ?? 0);
        }
      } catch (error) {
        console.error(
          "Erreur de chargement de la progression des cours :",
          error,
        );
      } finally {
        if (active) setLearningLoading(false);
      }
    }

    void loadLearningProgress();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadLeaderboard() {
      try {
        const supabase = getSupabase();

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError || !authData.user) {
          return;
        }

        const { data: userProfile, error: profileError } = await supabase
          .from("profiles")
          .select("user_code")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) {
          console.error(
            "Erreur de lecture du code COVA :",
            profileError.message,
          );
          return;
        }

        if (!userProfile?.user_code) return;

        const { data, error } = await supabase
          .from("leaderboard")
          .select("user_code, rank")
          .eq("user_code", userProfile.user_code)
          .maybeSingle();

        if (error) {
          console.error(
            "Erreur de chargement du classement :",
            error.message,
          );
          return;
        }

        const entry = data as LeaderboardEntry | null;

        if (active && entry?.rank != null) {
          setLeaderboardRank(Number(entry.rank));
        }
      } catch (error) {
        console.error("Impossible de charger le classement :", error);
      } finally {
        if (active) setLeaderboardLoading(false);
      }
    }

    void loadLeaderboard();

    return () => {
      active = false;
    };
  }, []);

  const xp = profile?.xp ?? 0;
  const { level, into, needed } = levelFor(xp);

  const displayName =
    profile?.display_name?.trim() ||
    state.session?.name ||
    state.settings.displayName;

  const firstName = displayName.split(" ")[0] ?? displayName;

  return (
    <>
      <PageHeader
        title={t("dashboard.welcome", { name: firstName })}
        description={t("dashboard.week")}
      />

      <Card className="mb-6">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cova-soft text-xl font-semibold">
            {level}
          </div>

          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">{t("dashboard.level", { level })}</p>
              <p className="text-sm text-cova-mute">
                {t("dashboard.xpToLevel", { into, needed, level: level + 1 })}
              </p>
            </div>

            <ProgressBar
              value={into}
              max={needed}
              label={t("dashboard.progressNextLevel")}
              className="mt-2"
            />

            {!profileLoading && profile?.user_code && (
              <p className="mt-2 text-sm text-cova-mute">
                {t("dashboard.covaCode", { code: profile.user_code })}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label={t("dashboard.totalXp")}
          value={xp.toLocaleString(formatTag)}
        />

        <StatCard
          icon={Trophy}
          label={t("dashboard.leaderboardRank")}
          value={
            leaderboardLoading
              ? "..."
              : leaderboardRank !== null
                ? `#${leaderboardRank}`
                : "—"
          }
          detail={
            leaderboardLoading
              ? t("dashboard.loadingRanking")
              : leaderboardRank !== null
                ? t("dashboard.realRanking")
                : t("dashboard.rankingUnavailable")
          }
        />

        <StatCard
          icon={BookOpen}
          label={t("dashboard.lessonsCompleted")}
          value={
            learningLoading ? "..." : String(completedLessons.length)
          }
        />

        <StatCard
          icon={Award}
          label={t("dashboard.challengesDone")}
          value={
            learningLoading
              ? "..."
              : String(challengesDone ?? state.completedChallenges.length)
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {learningLoading ? (
            <Card>
              <CardBody>
                <p className="text-sm text-cova-mute">
                  {t("dashboard.loadingProgress")}
                </p>
              </CardBody>
            </Card>
          ) : (
            <ContinueLearning
              enrolled={enrolledCourses}
              completedLessons={completedLessons}
            />
          )}

          <UpcomingAssignments />
        </div>

        <div className="space-y-6">
          <DailyChallengeCard completed={state.completedChallenges} />
          <SuggestedGroups />
        </div>
      </div>
    </>
  );
}
