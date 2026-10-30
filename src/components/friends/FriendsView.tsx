"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { MessageSquare, SearchX, UserMinus, UserPlus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import {
  friendsOf,
  incomingRequests,
  outgoingRequests,
  relationStatus,
  searchUsers,
  socialActions,
  useSocial,
  type RelationStatus,
} from "@/lib/social-store";
import type { SocialUser } from "@/types/social";
import { getSupabase } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/use-hydrated";

/** Extra profile bits (photo, title) fetched directly; stay empty before the migration runs. */
interface PersonExtras {
  headline: string;
  avatarUrl: string | null;
}

export function FriendsView() {
  const t = useT();
  const toast = useToast();
  const hydrated = useHydrated();
  const social = useSocial();
  const meId = social.meId ?? "";

  const [tab, setTab] = useState<"friends" | "requests" | "find">("friends");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [extras, setExtras] = useState<Record<string, PersonExtras>>({});

  const friends = useMemo(() => (meId ? friendsOf(social, meId) : []), [social, meId]);
  const incoming = useMemo(() => (meId ? incomingRequests(social, meId) : []), [social, meId]);
  const outgoing = useMemo(() => (meId ? outgoingRequests(social, meId) : []), [social, meId]);

  const peopleResults = useMemo(() => {
    if (!meId || !peopleQuery.trim()) return [];
    return searchUsers(social, meId, peopleQuery);
  }, [social, meId, peopleQuery]);

  // Server-side search joins the cache (same pattern as the messages page).
  useEffect(() => {
    if (peopleQuery.trim().replace(/^@/, "").length < 2) return;
    const timer = setTimeout(() => void socialActions.searchPeople(peopleQuery), 250);
    return () => clearTimeout(timer);
  }, [peopleQuery]);

  const codesKey = useMemo(
    () => [...friends, ...incoming, ...outgoing].map((u) => u.id).sort().join(","),
    [friends, incoming, outgoing],
  );

  useEffect(() => {
    if (!meId || !codesKey) return;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await getSupabase()
          .from("profiles")
          .select("user_code,display_name,headline,avatar_url")
          .in("user_code", codesKey.split(","));
        if (error) throw error;
        if (!active) return;
        const map: Record<string, PersonExtras> = {};
        for (const row of (data ?? []) as Array<{
          user_code: string | null;
          display_name: string | null;
          headline: string | null;
          avatar_url: string | null;
        }>) {
          if (row.user_code) {
            map[row.user_code] = { headline: row.headline ?? "", avatarUrl: row.avatar_url };
          }
        }
        setExtras(map);
      } catch {
        // Photos and titles stay empty when the profile migration hasn't run yet.
      }
    })();
    return () => {
      active = false;
    };
  }, [meId, codesKey]);

  if (!hydrated || !social.ready) {
    return (
      <Card>
        <ul className="divide-y divide-cova-line">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (!meId) {
    return (
      <EmptyState
        icon={Users}
        title={t("friends.tabFriends")}
        description={t("friends.signin")}
        action={
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
          >
            {t("common.signin")}
          </Link>
        }
      />
    );
  }

  async function run(action: Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    const result = await action;
    toast.push(result.ok ? successMessage : (result.error ?? ""));
  }

  function PersonRow({ user, children }: { user: SocialUser; children: ReactNode }) {
    const extra = extras[user.id];
    return (
      <li className="flex items-center gap-4 p-4">
        <Avatar name={user.displayName} src={extra?.avatarUrl} tone={user.tone} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.displayName}</p>
          <p className="truncate text-xs text-cova-mute">{extra?.headline || user.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </li>
    );
  }

  const tabs = [t("friends.tabFriends"), t("friends.tabRequests"), t("friends.tabFind")] as const;
  const activeTab = tab === "friends" ? tabs[0] : tab === "requests" ? tabs[1] : tabs[2];

  const emptyByTab: Record<typeof tab, { icon: typeof Users; title: string; description: string }> = {
    friends: { icon: Users, title: t("friends.emptyTitle"), description: t("friends.emptyBody") },
    requests: { icon: UserPlus, title: t("friends.receivedEmpty"), description: t("friends.searchHint") },
    find: { icon: SearchX, title: t("friends.searchEmptyTitle"), description: t("friends.searchHint") },
  };

  const rows: Array<{ user: SocialUser; actions: ReactNode }> =
    tab === "friends"
      ? friends.map((u) => ({
          user: u,
          actions: (
            <>
              <Link
                href={`/messages?to=${u.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-cova-soft px-3 text-sm font-medium text-cova-ink hover:bg-cova-muted"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" /> {t("friends.message")}
              </Link>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("friends.unfriend")}
                onClick={() =>
                  run(
                    socialActions.removeFriendship(meId, u.id),
                    t("friends.removed", { name: u.displayName }),
                  )
                }
              >
                <UserMinus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ),
        }))
      : tab === "requests"
        ? [
            ...incoming.map((u) => ({
              user: u,
              actions: (
                <>
                  <Button
                    size="sm"
                    onClick={() =>
                      run(
                        socialActions.respondFriendRequest(meId, u.id, true),
                        t("friends.accepted", { name: u.displayName }),
                      )
                    }
                  >
                    {t("friends.accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      run(
                        socialActions.respondFriendRequest(meId, u.id, false),
                        t("friends.declined"),
                      )
                    }
                  >
                    {t("friends.decline")}
                  </Button>
                </>
              ),
            })),
            ...outgoing.map((u) => ({
              user: u,
              actions: (
                <>
                  <Badge tone="outline">{t("friends.sentBadge")}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(socialActions.removeFriendship(meId, u.id), t("friends.cancelled"))
                    }
                  >
                    {t("friends.cancel")}
                  </Button>
                </>
              ),
            })),
          ]
        : peopleResults.map((u) => {
            const status: RelationStatus = relationStatus(social, meId, u.id);
            return {
              user: u,
              actions:
                status === "none" ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      run(
                        socialActions.sendFriendRequest(meId, u.id),
                        t("friends.requestSent", { name: u.displayName }),
                      )
                    }
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" /> {t("friends.add")}
                  </Button>
                ) : status === "sent" ? (
                  <>
                    <Badge tone="outline">{t("friends.sentBadge")}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(socialActions.removeFriendship(meId, u.id), t("friends.cancelled"))}
                    >
                      {t("friends.cancel")}
                    </Button>
                  </>
                ) : status === "received" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          socialActions.respondFriendRequest(meId, u.id, true),
                          t("friends.accepted", { name: u.displayName }),
                        )
                      }
                    >
                      {t("friends.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => run(socialActions.respondFriendRequest(meId, u.id, false), t("friends.declined"))}
                    >
                      {t("friends.decline")}
                    </Button>
                  </>
                ) : (
                  <Link
                    href={`/messages?to=${u.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-cova-soft px-3 text-sm font-medium text-cova-ink hover:bg-cova-muted"
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden="true" /> {t("friends.message")}
                  </Link>
                ),
            };
          });

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[...tabs]}
        value={activeTab}
        onChange={(v) => setTab(v === tabs[1] ? "requests" : v === tabs[2] ? "find" : "friends")}
        label={t("friends.title")}
        counts={{ [tabs[1]]: incoming.length }}
      />

      {tab === "find" && (
        <SearchInput
          label={t("friends.searchLabel")}
          placeholder={t("friends.searchPlaceholder")}
          value={peopleQuery}
          onChange={setPeopleQuery}
        />
      )}

      <Card>
        {rows.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={emptyByTab[tab].icon}
              title={emptyByTab[tab].title}
              description={emptyByTab[tab].description}
            />
          </div>
        ) : (
          <ul className="divide-y divide-cova-line">
            {rows.map(({ user, actions }) => (
              <PersonRow key={`${tab}-${user.id}`} user={user}>
                {actions}
              </PersonRow>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
