"use client";

import Link from "next/link";

import { Clock, Globe, Lock, Users } from "lucide-react";

import { RoleBadge } from "@/components/community/CommunityAdminPanels";

import { Badge } from "@/components/ui/Badge";

import { Button, buttonStyles } from "@/components/ui/Button";

import { Card } from "@/components/ui/Card";

import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";

import type { Community, CommunityRole } from "@/types/social";

/** Fixed category list -> catalog keys, so the badge follows the interface language. */
export const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  Study: "community.cat.study",
  Project: "community.cat.project",
  Coding: "community.cat.coding",
  Design: "community.cat.design",
  Languages: "community.cat.languages",
  Other: "community.cat.other",
};

interface CommunityCardProps {
  community: Community;

  members: number;

  /** The current user's role, or null if they are not a member. */

  role: CommunityRole | null;

  /** Called when the user clicks "Join" on a public community they are not in. */

  onJoin?: () => void;

  /** True while the user's join request is waiting for approval. */

  pending?: boolean;
}

export function CommunityCard({
  community,
  members,
  role,
  onJoin,
  pending = false,
}: CommunityCardProps) {
  const t = useT();
  const isPrivate = community.visibility === "private";

  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border border-cova-line bg-white p-0 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-xl">
      <div className="h-1.5 w-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400" />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="soft">
            {community.category
              ? t(CATEGORY_LABEL_KEYS[community.category] ?? "community.cat.other")
              : community.category}
          </Badge>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cova-line bg-slate-50 px-2.5 py-1 text-xs font-medium text-cova-mute">
              {isPrivate ? (
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              )}

              {isPrivate ? t("community.private") : t("community.public")}
            </span>

            {role && <RoleBadge role={role} />}
          </div>
        </div>

        <h3 className="mt-5 text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-blue-700">
          {pending ? (
            community.name
          ) : (
            <Link
              href={`/community/${community.id}`}

              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {community.name}
            </Link>
          )}
        </h3>

        <p className="mt-2 line-clamp-3 min-h-[4.5rem] flex-1 whitespace-pre-line text-sm leading-7 text-cova-mute">
          {community.description}
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-cova-line pt-4">
          <p className="flex items-center gap-2 text-sm text-cova-mute">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-blue-700">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>

            {t("community.membersCount", { n: members })}
          </p>

          {pending && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t("community.pending")}
            </span>
          )}
        </div>

        <div className="mt-5">
          {pending ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              <Clock className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {t("community.waitingApproval")}
            </p>
          ) : role ? (
            <Link
              href={`/community/${community.id}`}

              className={`${buttonStyles({ variant: "secondary", size: "sm" })} flex w-full items-center justify-center rounded-xl transition-colors`}
            >
              {t("community.openCommunity")}
            </Link>
          ) : (
            <div className="flex gap-2">
              {onJoin && !isPrivate && (
                <Button size="sm" onClick={onJoin}>
                  {t("community.joinAction")}
                </Button>
              )}

              <Link
                href={`/community/${community.id}`}

                className={`${buttonStyles({ variant: "secondary", size: "sm" })} flex flex-1 items-center justify-center rounded-xl transition-colors`}
              >
                {t("community.viewCommunity")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
