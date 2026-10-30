"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/client";
import { daysUntil } from "@/lib/utils";

type Upcoming = { id: string; title: string; course: string; dueAt: string };

export function UpcomingAssignments() {
  const { t, formatTag } = useI18n();
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = getSupabase();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) return;
        const [{ data: assignments, error: assignmentError }, { data: submissions, error: submissionError }] = await Promise.all([
          supabase.from("assignments").select("id,title,course_id,created_by,due_at").order("due_at").limit(20),
          supabase.from("assignment_submissions").select("assignment_id,status").eq("student_id", authData.user.id),
        ]);
        if (assignmentError) throw assignmentError;
        if (submissionError) throw submissionError;
        const submissionStatus = new Map((submissions ?? []).map((item) => [item.assignment_id, item.status]));
        const pending = (assignments ?? []).filter((item) =>
          item.created_by !== authData.user!.id && !["submitted", "graded"].includes(submissionStatus.get(item.id) ?? "todo"),
        );
        const courseIds = [...new Set(pending.map((item) => item.course_id))];
        const { data: courses, error: courseError } = courseIds.length
          ? await supabase.from("courses").select("id,title").in("id", courseIds)
          : { data: [], error: null };
        if (courseError) throw courseError;
        const names = new Map((courses ?? []).map((course) => [course.id, course.title]));
        if (active) setUpcoming(pending.slice(0, 4).map((item) => ({ id: item.id, title: item.title, course: names.get(item.course_id) ?? "", dueAt: item.due_at })));
      } catch (error) {
        console.error("Unable to load upcoming assignments:", error);
        if (active) setUpcoming([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <Card>
      <CardHeader title={t("dashboard.upcomingAssignments")} action={<Link href="/assignments" className="text-sm font-medium underline-offset-2 hover:underline">{t("dashboard.viewAll")}</Link>} />
      <CardBody>
        {loading ? <p className="text-sm text-cova-mute">{t("dashboard.loadingAssignments")}</p> : upcoming.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-cova-mute"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t("dashboard.caughtUp")}</p>
        ) : (
          <ul className="divide-y divide-cova-line">
            {upcoming.map((assignment) => (
              <li key={assignment.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0"><Link href={`/assignments/${assignment.id}`} className="block truncate text-sm font-medium hover:underline">{assignment.title}</Link><p className="truncate text-xs text-cova-mute">{assignment.course}</p></div>
                <Badge tone={daysUntil(assignment.dueAt) <= 3 ? "soft" : "pale"}>{new Date(assignment.dueAt).toLocaleDateString(formatTag)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
