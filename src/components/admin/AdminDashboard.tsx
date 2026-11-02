"use client";

import { useState } from "react";
import { BookOpen, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToast } from "@/components/ui/Toast";
import { StatCard } from "@/components/dashboard/StatCard";
import { useT } from "@/i18n/client";
import { courses } from "@/data/courses";
import { groups } from "@/data/groups";
import { students } from "@/data/students";
import { matchesQuery } from "@/lib/utils";

const reports = [
  { id: "rp1", subject: "Off-topic post in Design Critique Corner", reporter: "Lucas Meyer" },
  { id: "rp2", subject: "Duplicate group: Exam Sprint Club", reporter: "Noor Haddad" },
];

export function AdminDashboard() {
  const t = useT();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<string[]>([]);
  const people = students.filter((s) => matchesQuery(query, s.name, s.school, s.major));
  const open = reports.filter((r) => !resolved.includes(r.id));

  return (
    <div className="space-y-6">
      <DemoNotice>{t("admin.demoNote")}</DemoNotice>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label={t("admin.tabStudents")} value={String(students.length)} />
        <StatCard icon={UserCheck} label={t("admin.tabGroups")} value={String(groups.length)} />
        <StatCard icon={BookOpen} label={t("admin.tabCourses")} value={String(courses.length)} />
        <StatCard icon={ShieldCheck} label={t("admin.tabReports")} value={String(open.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("admin.tabStudents")}
            action={
              <SearchInput
                label={t("admin.search")}
                placeholder={t("admin.search")}
                value={query}
                onChange={setQuery}
                className="w-56"
              />
            }
          />
          <CardBody>
            {people.length === 0 ? (
              <p className="text-sm text-cova-mute">{t("admin.noMatch")}</p>
            ) : (
              <ul className="divide-y divide-cova-line">
                {people.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={s.name} tone={s.tone} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-cova-mute">{s.school}</span>
                      </span>
                    </span>
                    <Badge tone="outline">{t("admin.studentBadge")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("admin.tabReports")} />
          <CardBody>
            {open.length === 0 ? (
              <p className="text-sm text-cova-mute">{t("admin.noReports")}</p>
            ) : (
              <ul className="space-y-4">
                {open.map((r) => (
                  <li key={r.id}>
                    <p className="text-sm font-medium">{r.subject}</p>
                    <p className="text-xs text-cova-mute">
                      {t("admin.reportedBy", { name: r.reporter })}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => {
                        setResolved((x) => [...x, r.id]);
                        toast.push(t("admin.resolved"));
                      }}
                    >
                      {t("admin.markResolved")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
