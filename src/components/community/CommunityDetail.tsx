"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Globe, Lock, SearchX, Trash2, Users } from "lucide-react";
import { MediaComposer } from "@/components/common/MediaComposer";
import { PostAttachments } from "@/components/common/PostAttachments";
import {
  MembersTab,
  RequestsTab,
  RoleBadge,
  SettingsTab,
} from "@/components/community/CommunityAdminPanels";
import { POSTING_CHOICES } from "@/components/community/CreateCommunityModal";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { getStudent } from "@/data/students";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import { useHydrated } from "@/lib/use-hydrated";
import {
  LIMITS,
  canPost,
  formatWhen,
  isStaff,
  memberCount,
  roleOf,
  socialActions,
  useMe,
  useSocial,
} from "@/lib/social-store";
import type { Community, CommunityRole, PostAttachment, SocialUser } from "@/types/social";

type TabName = "Feed" | "Members" | "Requests" | "Settings";

function BackLink() {
  const t = useT();
  return (
    <Link
      href="/community"
      className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-cova-mute hover:text-cova-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("community.back")}
    </Link>
  );
}

/** Shown to people who are not members of a private community. Reveals nothing about it. */
function PrivateGate({
  meId,
  requested,
  communityId,
}: {
  meId: string;
  requested: boolean;
  communityId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await socialActions.joinByCode(meId, code);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.push(
      result.value.outcome === "requested"
        ? t("community.privateRequested")
        : t("community.joinedCommunity"),
    );
    router.push(`/community/${result.value.communityId}`);
  }

  return (
    <>
      <BackLink />
      <EmptyState
        icon={Lock}
        title={t("community.privateTitle")}
        description={requested ? t("community.privateWaiting") : t("community.privateHint")}
        action={
          requested ? (
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await socialActions.cancelJoinRequest(meId, communityId);
                toast.push(result.ok ? t("community.requestCancelled") : result.error);
              }}
            >
              {t("community.cancelRequest")}
            </Button>
          ) : (
            <form
              onSubmit={onSubmit}
              noValidate
              className="flex w-72 max-w-full flex-col gap-3 text-start"
            >
              <TextField
                id="gate-code"
                label={t("community.joinCode")}
                value={code}
                error={error}
                autoComplete="off"
                className="font-mono uppercase"
                onChange={(e) => {
                  setCode(e.target.value);
                  setError("");
                }}
              />
              <Button type="submit" disabled={!code.trim()}>
                {t("community.requestAccess")}
              </Button>
            </form>
          )
        }
      />
    </>
  );
}

function postingNotice(community: Community, role: CommunityRole | null, t: TFunction): string {
  if (!role) return t("community.joinToPost");
  return community.postingPolicy === "owner"
    ? t("community.postOwnerOnly")
    : t("community.postStaffOnly");
}

export function CommunityDetail({ communityId }: { communityId: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const hydrated = useHydrated();
  const me = useMe();
  const social = useSocial();
  const [tab, setTab] = useState<TabName>("Feed");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PostAttachment[]>([]);
  // Private communities you aren't in can't be read, so ask the server whether the id is one.
  const [probed, setProbed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void socialActions.probeCommunity(communityId).then(() => {
      if (!cancelled) setProbed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const posts = useMemo(
    () => social.posts.filter((p) => p.communityId === communityId).sort((a, b) => b.at - a.at),
    [social.posts, communityId],
  );
  const requestCount = social.requests.filter((r) => r.communityId === communityId).length;

  if (!hydrated || !me) return <Skeleton className="h-64 w-full" />;

  const community = social.communities[communityId];
  if (!community && !probed) return <Skeleton className="h-64 w-full" />;
  if (!community)
    return (
      <>
        <BackLink />
        <EmptyState
          icon={SearchX}
          title={t("community.notFoundTitle")}
          description={t("community.notFoundDesc")}
          action={
            <Link href="/community" className={buttonStyles({ variant: "secondary" })}>
              {t("community.back")}
            </Link>
          }
        />
      </>
    );

  const meId = me.id;
  const role = roleOf(social, communityId, meId);
  const staff = isStaff(role);
  const requested = social.requests.some((r) => r.communityId === communityId && r.userId === meId);

  if (!role && community.visibility === "private")
    return <PrivateGate meId={meId} requested={requested} communityId={communityId} />;

  const tabs: TabName[] = ["Feed", "Members"];
  if (staff) tabs.push("Requests");
  if (role === "owner") tabs.push("Settings");
  const activeTab = tabs.includes(tab) ? tab : "Feed";

  const tabLabels: Partial<Record<TabName, string>> = {
    Feed: t("community.tabFeed"),
    Members: t("community.tabMembers"),
    Requests: t("community.tabRequests"),
    Settings: t("community.tabSettings"),
  };
  const policyLabel = t(
    POSTING_CHOICES.find((p) => p.value === community.postingPolicy)?.labelKey ??
      "community.everyone",
  );
  const isPrivate = community.visibility === "private";

  async function onPost(e: FormEvent) {
    e.preventDefault();
    const result = await socialActions.postToCommunity(meId, communityId, draft, attachments);
    if (!result.ok) {
      toast.push(result.error);
      return;
    }
    setDraft("");
    setAttachments([]);
  }

  function authorLabel(author: SocialUser | undefined) {
    return author?.displayName ?? t("community.formerMember");
  }

  return (
    <>
      <BackLink />

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="soft">{community.category}</Badge>
              <span className="flex items-center gap-1 text-xs text-cova-mute">
                {isPrivate ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isPrivate ? t("community.private") : t("community.public")}
              </span>
              {role && <RoleBadge role={role} />}
            </div>
            <h1 className="mt-3 text-2xl font-semibold">{community.name}</h1>
            <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-cova-mute">
              {community.description}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cova-mute">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" aria-hidden="true" />{" "}
                {t("community.membersCount", { n: memberCount(social, communityId) })}
              </span>
              <span>
                {t("community.whoCanPost")}: {policyLabel}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            {!role && (
              <Button
                onClick={async () => {
                  const result = await socialActions.joinCommunity(meId, communityId);
                  toast.push(
                    result.ok ? t("community.joinedName", { name: community.name }) : result.error,
                  );
                }}
              >
                {t("community.joinCommunity")}
              </Button>
            )}
            {role && role !== "owner" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!window.confirm(t("community.leaveConfirm", { name: community.name })))
                    return;
                  const result = await socialActions.leaveCommunity(meId, communityId);
                  toast.push(result.ok ? t("community.left") : result.error);
                  if (result.ok && isPrivate) router.push("/community");
                }}
              >
                {t("community.leave")}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="mt-6">
        <Tabs
          tabs={tabs}
          value={activeTab}
          onChange={setTab}
          label={t("community.sectionsLabel")}
          labels={tabLabels}
          counts={requestCount > 0 && staff ? { Requests: requestCount } : undefined}
        />
      </div>

      <div className="mt-4">
        {activeTab === "Feed" && (
          <div className="space-y-4">
            {role && canPost(community, role) ? (
              <Card>
                <CardBody>
                  <form onSubmit={onPost} className="space-y-3">
                    <label htmlFor="community-post" className="sr-only">
                      {t("community.writePost")}
                    </label>
                    <textarea
                      id="community-post"
                      value={draft}
                      maxLength={LIMITS.text.max}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={t("community.postPlaceholder")}
                      className="min-h-20 w-full rounded-lg border border-cova-line px-3 py-2 text-sm placeholder:text-cova-mute"
                    />
                    <MediaComposer spaceId={communityId} onChange={setAttachments} />
                    <div className="flex justify-end">
                      <Button type="submit" disabled={!draft.trim() && attachments.length === 0}>
                        {t("community.post")}
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            ) : (
              <p className="rounded-lg bg-cova-pale px-4 py-3 text-sm">
                {postingNotice(community, role, t)}
              </p>
            )}

            {posts.length === 0 ? (
              <p className="py-8 text-center text-sm text-cova-mute">{t("community.noPosts")}</p>
            ) : (
              posts.map((p) => {
                const author = social.users[p.authorId];
                const authorRole = roleOf(social, communityId, p.authorId);
                const canDelete =
                  p.authorId === meId ||
                  role === "owner" ||
                  (role === "admin" && authorRole !== "owner" && authorRole !== "admin");
                const profile = author && getStudent(author.id);
                return (
                  <Card key={p.id}>
                    <CardBody className="flex gap-3">
                      <Avatar name={authorLabel(author)} tone={author?.tone} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          {profile ? (
                            <Link
                              href={`/community/${profile.id}`}
                              className="font-semibold hover:underline"
                            >
                              {authorLabel(author)}
                            </Link>
                          ) : (
                            <span className="font-semibold">{authorLabel(author)}</span>
                          )}
                          {authorRole && <RoleBadge role={authorRole} />}
                          <span className="text-cova-mute">· {formatWhen(p.at)}</span>
                        </p>
                        {p.text && (
                          <p className="mt-1 whitespace-pre-line break-words text-sm">{p.text}</p>
                        )}
                        <PostAttachments attachments={p.attachments} />
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={t("community.deletePost")}
                          onClick={async () => {
                            const result = await socialActions.deletePost(meId, p.id);
                            if (!result.ok) toast.push(result.error);
                          }}
                          className="h-8 w-8 shrink-0 rounded-lg p-1.5 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
                        >
                          <Trash2 className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </CardBody>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {activeTab === "Members" && role && (
          <MembersTab community={community} meId={meId} myRole={role} />
        )}
        {activeTab === "Members" && !role && (
          <p className="rounded-lg bg-cova-pale px-4 py-3 text-sm">
            {t("community.joinToSeeMembers")}
          </p>
        )}
        {activeTab === "Requests" && staff && <RequestsTab community={community} meId={meId} />}
        {activeTab === "Settings" && role === "owner" && (
          <SettingsTab community={community} meId={meId} />
        )}
      </div>
    </>
  );
}
