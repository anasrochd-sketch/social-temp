"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Medal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { buttonStyles } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tabs } from "@/components/ui/Tabs";
import { getStudent } from "@/data/students";
import { useI18n } from "@/i18n/client";
import { useS } from "@/i18n/spaces";
import { useDemoState } from "@/lib/demo-store";
import { buildLeaderboard, levelFor, xpBreakdown } from "@/lib/progress";
import { useSocial } from "@/lib/social-store";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface RealRow {
  id: string;
  name: string;
  xp: number;
  isMe: boolean;
  rank: number;
}

interface ProfileRow {
  user_code: string | null;
  display_name: string | null;
  xp: number | null;
}

/**
 * XP ranking. Signed in: real XP stored on the server (profiles.xp, credited by
 * the database when a challenge is graded). Signed out: the sample board.
 */
export function LeaderboardTable() {
  const t = useS();
  const { formatTag } = useI18n();
  const state = useDemoState();
  const social = useSocial();
  const [top5, setTop5] = useState(false);
  const storeReady = social.ready;
  const signedIn = storeReady && !!social.meId;

  const [realRows, setRealRows] = useState<RealRow[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!signedIn || !social.meId) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    setLoading(true);
    void (async () => {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("profiles")
          .select("user_code,display_name,xp")
          .order("xp", { ascending: false })
          .limit(100);
        if (error) throw error;

        const rows: RealRow[] = [];
        let myXpValue: number | null = null;
        let myRankValue: number | null = null;
        ((data ?? []) as ProfileRow[]).forEach((row, i) => {
          const isMe = row.user_code !== null && row.user_code === social.meId;
          rows.push({
            id: row.user_code ?? `row-${i}`,
            name: row.display_name?.trim() || "Student",
            xp: row.xp ?? 0,
            isMe,
            rank: i + 1,
          });
          if (isMe) {
            myXpValue = row.xp ?? 0;
            myRankValue = i + 1;
          }
        });

        // Outside the top 100: read the own row and derive the rank from the count of better scores.
        if (myRankValue === null) {
          const { data: mine } = await supabase
            .from("profiles")
            .select("xp")
            .eq("user_code", social.meId)
            .maybeSingle();
          myXpValue = (mine as { xp: number | null } | null)?.xp ?? 0;
          const { count } = await supabase
            .from("profiles")
            .select("user_code", { count: "exact", head: true })
            .gt("xp", myXpValue);
          myRankValue = (count ?? 0) + 1;
        }

        if (active) {
          setRealRows(rows);
          setMyXp(myXpValue);
          setMyRank(myRankValue);
        }
      } catch (error) {
        console.error("Unable to load the leaderboard:", error);
        if (active) setRealRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [signedIn, social.meId]);

  const meName = social.meId ? social.users[social.meId]?.displayName ?? "" : "";

  // Signed-out fallback: the sample board, without the demo user itself.
  const demoBreakdown = xpBreakdown(state);
  const demoName = state.session?.name ?? state.settings.displayName;
  const demoAll = buildLeaderboard(demoBreakdown.total, demoName)
    .filter((r) => !r.isMe)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const all: RealRow[] = signedIn
    ? realRows
    : demoAll.map((r) => ({ id: r.id, name: r.name, xp: r.xp, isMe: false, rank: r.rank }));
  const rows = top5 ? all.slice(0, 5) : all;
  const fmt = (n: number) => n.toLocaleString(formatTag);
  const tabAll = t("lb.all");
  const tabTop = t("lb.top5");
  const level = myXp !== null ? levelFor(myXp) : null;

  return (
    <>
      <PageHeader title={t("lb.title")} description={t("lb.desc")} />

      {!storeReady || (signedIn && loading) ? (
        <p className="mb-4 rounded-lg bg-cova-pale px-4 py-3 text-sm">{t("lb.loading")}</p>
      ) : signedIn && myRank !== null && myXp !== null ? (
        <p className="mb-4 rounded-lg bg-cova-pale px-4 py-3 text-sm">
          {t("lb.ranked", { name: meName, rank: myRank, xp: fmt(myXp) })}
        </p>
      ) : !signedIn ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg bg-cova-pale px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{t("lb.signin")}</span>
          <Link href="/login" className={buttonStyles({ size: "sm", variant: "secondary" })}>
            {t("lb.signinBtn")}
          </Link>
        </div>
      ) : null}

      {signedIn && level && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold">{t("lb.progressTitle")}</h2>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p className="font-semibold">
                {t("lb.level")} {level.level}
              </p>
              <p className="text-cova-mute">
                {t("lb.progressNext", { into: fmt(level.into), needed: fmt(level.needed), next: level.level + 1 })}
              </p>
            </div>
            <ProgressBar
              value={level.into}
              max={level.needed}
              label={t("lb.progressTitle")}
              className="mt-2"
            />
          </CardBody>
        </Card>
      )}

      <div className="mb-4">
        <Tabs
          tabs={[tabAll, tabTop]}
          value={top5 ? tabTop : tabAll}
          onChange={(v) => setTop5(v === tabTop)}
          label={t("lb.title")}
        />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("lb.title")}</caption>
          <thead className="border-b border-cova-line bg-cova-bg text-start text-cova-mute">
            <tr>
              <th scope="col" className="w-16 px-4 py-3 text-start font-medium">
                {t("lb.rank")}
              </th>
              <th scope="col" className="px-4 py-3 text-start font-medium">
                {t("lb.student")}
              </th>
              <th scope="col" className="hidden px-4 py-3 text-start font-medium sm:table-cell">
                {t("lb.level")}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium">
                {t("lb.xp")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cova-line">
            {rows.map((r) => {
              const s = getStudent(r.id);
              return (
                <tr key={r.id} className={cn(r.isMe && "bg-cova-pale/60")}>
                  <td className="px-4 py-3 font-medium">
                    {r.rank <= 3 ? (
                      <span className="flex items-center gap-1.5">
                        <Medal className="h-4 w-4 text-cova-muted" aria-hidden="true" />
                        {r.rank}
                      </span>
                    ) : (
                      r.rank
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name} tone={s?.tone ?? "soft"} size="sm" />
                      <span className="font-medium">
                        {r.name}
                        {r.isMe && ` (${t("lb.you")})`}
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-cova-mute sm:table-cell">
                    {levelFor(r.xp).level}
                  </td>
                  <td className="px-4 py-3 text-end font-medium">{fmt(r.xp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
