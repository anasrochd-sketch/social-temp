"use client";

import Link from "next/link";
import {
  ArrowLeft,
  GraduationCap,
  MapPin,
  MessageSquare,
  UserCheck,
  UserPlus,
  CalendarDays,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { groups } from "@/data/groups";
import { levelFor } from "@/lib/progress";
import { relationStatus, socialActions, useMe, useSocial } from "@/lib/social-store";
import type { Student } from "@/types";

export function ProfileView({ student }: { student: Student }) {
  const toast = useToast();
  const t = useT();
  const me = useMe();
  const social = useSocial();
  const relation = me ? relationStatus(social, me.id, student.id) : "none";
  const memberOf = groups.filter((g) => g.memberIds.includes(student.id));
  const { level } = levelFor(student.xp);

  return (
    <>
      <Link
        href="/community"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-cova-mute hover:text-cova-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to community
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={student.name} tone={student.tone} size="lg" />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{student.name}</h1>
            <p className="text-cova-mute">{student.headline}</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-cova-mute">
              <li className="flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4" aria-hidden="true" /> {student.major},{" "}
                {student.school}
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {student.location}
              </li>
              <li className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" /> Joined {student.joined}
              </li>
            </ul>
          </div>
          <div className="flex gap-2">
            {me && relation === "none" && (
              <Button
                onClick={async () => {
                  const result = await socialActions.sendFriendRequest(me.id, student.id);
                  toast.push(result.ok ? `Request sent to ${student.name}` : result.error);
                }}
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" /> Add friend
              </Button>
            )}
            {me && relation === "sent" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const result = await socialActions.removeFriendship(me.id, student.id);
                  toast.push(result.ok ? "Request cancelled" : result.error);
                }}
              >
                Cancel request
              </Button>
            )}
            {me && relation === "received" && (
              <Button
                onClick={async () => {
                  const result = await socialActions.respondFriendRequest(me.id, student.id, true);
                  toast.push(result.ok ? `You and ${student.name} are now friends` : result.error);
                }}
              >
                <UserCheck className="h-4 w-4" aria-hidden="true" /> Accept request
              </Button>
            )}
            {me && relation === "friends" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!window.confirm(`Remove ${student.name} from your friends?`)) return;
                  const result = await socialActions.removeFriendship(me.id, student.id);
                  toast.push(result.ok ? "Friend removed" : result.error);
                }}
              >
                <UserCheck className="h-4 w-4" aria-hidden="true" /> Friends
              </Button>
            )}
            <Link
              href={`/messages?to=${student.id}`}
              className={buttonStyles({ variant: "secondary" })}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> Message
            </Link>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={t("profile.about")} />
            <CardBody>
              <p className="text-sm leading-relaxed">{student.bio}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("profile.skillsInterests")} />
            <CardBody className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-cova-mute">{t("profile.skills")}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {student.skills.map((s) => (
                    <li key={s}>
                      <Badge tone="soft">{s}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-cova-mute">{t("profile.interests")}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {student.interests.map((s) => (
                    <li key={s}>
                      <Badge>{s}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("profile.groups")} />
            <CardBody>
              {memberOf.length === 0 ? (
                <p className="text-sm text-cova-mute">
                  {student.name.split(" ")[0]} hasn&apos;t joined any groups yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {memberOf.map((g) => (
                    <li key={g.id}>
                      <Link
                        href={`/groups/${g.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {g.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Progress" />
            <CardBody>
              <p className="text-3xl font-semibold">{student.xp.toLocaleString("en-US")}</p>
              <p className="text-sm text-cova-mute">XP · Level {level}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Badges" />
            <CardBody>
              <ul className="flex flex-wrap gap-1.5">
                {student.badges.map((b) => (
                  <li key={b}>
                    <Badge tone="outline">{b}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
