"use client";

import Link from "next/link";
import { Award, Check } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { challenges } from "@/data/challenges";
import { demoActions } from "@/lib/demo-store";
import { useT } from "@/i18n/client";

export function DailyChallengeCard({ completed }: { completed: string[] }) {
  const t = useT();
  const toast = useToast();
  const challenge = challenges.find((c) => c.kind === "Daily");
  if (!challenge) return null;
  const done = completed.includes(challenge.id);
  const challengeTitle = challenge.id === "ch-1"
    ? t("dashboard.challenge.reverseString")
    : challenge.title;
  const challengeDescription = challenge.id === "ch-1"
    ? t("dashboard.challenge.reverseStringDescription")
    : challenge.description;

  return (
    <Card>
      <CardHeader
        title={t("dashboard.dailyChallenge")}
        action={
          <Link
            href="/challenges"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            {t("dashboard.allChallenges")}
          </Link>
        }
      />
      <CardBody>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
            <Award className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">{challengeTitle}</p>
            <p className="mt-1 text-sm text-cova-mute">{challengeDescription}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="soft">+{challenge.points} XP</Badge>
              <Badge tone="outline">{challenge.minutes} min</Badge>
            </div>
          </div>
        </div>
        <Button
          className="mt-4 w-full"
          variant={done ? "secondary" : "primary"}
          onClick={() => {
            demoActions.toggleChallenge(challenge.id);
            toast.push(
              done
                ? t("dashboard.challengeNotDone")
                : t("dashboard.challengeComplete", { points: challenge.points }),
            );
          }}
        >
          {done && <Check className="h-4 w-4" aria-hidden="true" />}
          {done ? t("dashboard.completed") : t("dashboard.markComplete")}
        </Button>
      </CardBody>
    </Card>
  );
}
