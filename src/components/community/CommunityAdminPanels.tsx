"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  MessageSquare,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserX,
  X,
} from "lucide-react";
import { CategorySelect, useTranslatedChoices } from "@/components/community/CreateCommunityModal";
import { QrImage } from "@/components/common/QrImage";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChoiceGroup } from "@/components/community/ChoiceGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { copyText } from "@/lib/clipboard";
import { formatWhen, isStaff, socialActions, useSocial } from "@/lib/social-store";
import type {
  Community,
  CommunityLocale,
  CommunityRole,
  CommunityVisibility,
  PostingPolicy,
} from "@/types/social";

const ROLE_RANK: Record<CommunityRole, number> = { owner: 0, admin: 1, member: 2 };

export function RoleBadge({ role }: { role: CommunityRole }) {
  const t = useT();
  if (role === "member") return null;
  return (
    <Badge tone={role === "owner" ? "soft" : "pale"}>
      {t(role === "owner" ? "community.roleOwner" : "community.roleAdmin")}
    </Badge>
  );
}

/* ------------------------------------------------------------------ invite */

export function InviteCard({
  community,
  canRegenerate,
  meId,
}: {
  community: Community;
  canRegenerate: boolean;
  meId: string;
}) {
  const toast = useToast();
  const t = useT();
  const [showQr, setShowQr] = useState(false);
  const link = `${typeof window === "undefined" ? "" : window.location.origin}/community?join=${community.joinCode}`;

  async function copy(text: string, what: string) {
    toast.push(
      (await copyText(text))
        ? t("community.inviteCopied", { what })
        : t("community.inviteCopyFail"),
    );
  }

  return (
    <Card>
      <CardHeader
        title={t("share.title")}
        description={
          community.visibility === "private"
            ? t("community.invitePrivateHint")
            : t("community.invitePublicHint")
        }
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-cova-pale px-3 py-2 font-mono text-base font-semibold tracking-widest">
            {community.joinCode}
          </code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => copy(community.joinCode, t("community.code"))}
          >
            <Copy className="h-4 w-4" aria-hidden="true" /> {t("share.copyCode")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copy(link, t("community.link"))}>
            <Copy className="h-4 w-4" aria-hidden="true" /> {t("share.copyLink")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowQr((v) => !v)}>
            <QrCode className="h-4 w-4" aria-hidden="true" />{" "}
            {showQr ? t("share.hideQr") : t("share.showQr")}
          </Button>
          {canRegenerate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!window.confirm(t("community.oldCodeWarning"))) return;
                const result = await socialActions.regenerateJoinCode(meId, community.id);
                toast.push(result.ok ? t("community.newCodeCreated") : result.error);
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("share.regenerate")}
            </Button>
          )}
        </div>
        {showQr && (
          <div className="flex justify-center rounded-lg border border-cova-line bg-white p-3">
            <QrImage value={link} size={200} />
          </div>
        )}
        <p className="break-all text-xs text-cova-mute">{link}</p>
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------- members */

export function MembersTab({
  community,
  meId,
  myRole,
}: {
  community: Community;
  meId: string;
  myRole: CommunityRole;
}) {
  const toast = useToast();
  const t = useT();
  const social = useSocial();
  const staff = isStaff(myRole);

  const members = useMemo(
    () =>
      social.members
        .filter((m) => m.communityId === community.id)
        .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt - b.joinedAt),
    [social.members, community.id],
  );

  async function report(pending: Promise<{ ok: boolean; error?: string }>, message: string) {
    const result = await pending;
    toast.push(result.ok ? message : (result.error ?? "Something went wrong."));
  }

  return (
    <div className="space-y-4">
      {staff && <InviteCard community={community} canRegenerate={myRole === "owner"} meId={meId} />}
      <Card>
        <CardHeader title={t("community.membersTitle", { n: members.length })} />
        <ul className="mt-2 divide-y divide-cova-line">
          {members.map((m) => {
            const user = social.users[m.userId];
            const name = user?.displayName ?? t("community.formerMember");
            const canRemove =
              m.userId !== meId &&
              m.role !== "owner" &&
              (myRole === "owner" || (myRole === "admin" && m.role === "member"));
            return (
              <li
                key={m.userId}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={name} tone={user?.tone} size="sm" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">
                        {name}
                        {m.userId === meId && ` ${t("community.youSuffix")}`}
                      </span>
                      <RoleBadge role={m.role} />
                    </p>
                    <p className="font-mono text-xs text-cova-mute">{m.userId}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.userId !== meId && (
                    <Link
                      href={`/messages?to=${encodeURIComponent(m.userId)}`}
                      className={buttonStyles({ variant: "secondary", size: "sm" })}
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />{" "}
                      {t("community.message")}
                    </Link>
                  )}
                  {myRole === "owner" && m.role === "member" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        report(
                          socialActions.setMemberRole(meId, community.id, m.userId, "admin"),
                          t("community.nowAdmin", { name }),
                        )
                      }
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />{" "}
                      {t("community.makeAdmin")}
                    </Button>
                  )}
                  {myRole === "owner" && m.role === "admin" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        report(
                          socialActions.setMemberRole(meId, community.id, m.userId, "member"),
                          t("community.noLongerAdmin", { name }),
                        )
                      }
                    >
                      <ShieldOff className="h-4 w-4" aria-hidden="true" />{" "}
                      {t("community.removeAdmin")}
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(t("community.removeConfirm", { name })))
                          report(
                            socialActions.removeMember(meId, community.id, m.userId),
                            t("community.removed", { name }),
                          );
                      }}
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" /> {t("community.remove")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- requests */

export function RequestsTab({ community, meId }: { community: Community; meId: string }) {
  const toast = useToast();
  const t = useT();
  const social = useSocial();
  const requests = useMemo(
    () =>
      social.requests
        .filter((r) => r.communityId === community.id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [social.requests, community.id],
  );

  if (requests.length === 0)
    return (
      <EmptyState
        icon={Check}
        title={t("community.noPendingRequests")}
        description={t("community.noPendingRequestsHint")}
      />
    );

  return (
    <Card>
      <ul className="divide-y divide-cova-line">
        {requests.map((r) => {
          const user = social.users[r.userId];
          const name = user?.displayName ?? t("community.unknownPerson");
          return (
            <li
              key={r.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={name} tone={user?.tone} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="text-xs text-cova-mute">
                    <span className="font-mono">{r.userId}</span> ·{" "}
                    {t("community.askedAgo", { when: formatWhen(r.createdAt) })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    const result = await socialActions.decideJoinRequest(meId, r.id, true);
                    toast.push(result.ok ? t("community.approvedName", { name }) : result.error);
                  }}
                >
                  <Check className="h-4 w-4" aria-hidden="true" /> {t("community.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const result = await socialActions.decideJoinRequest(meId, r.id, false);
                    toast.push(result.ok ? t("community.declined") : result.error);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" /> {t("community.decline")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- settings */

export function SettingsTab({ community, meId }: { community: Community; meId: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { visibilityChoices, postingChoices } = useTranslatedChoices();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [category, setCategory] = useState(community.category);
  const [visibility, setVisibility] = useState<CommunityVisibility>(community.visibility);
  const [postingPolicy, setPostingPolicy] = useState<PostingPolicy>(community.postingPolicy);
  const [communityLocale, setCommunityLocale] = useState<CommunityLocale>(community.locale);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await socialActions.updateCommunity(meId, community.id, {
      name,
      description,
      category,
      visibility,
      postingPolicy,
      hideMembers: community.hideMembers,
      locale: communityLocale,
    });
    setError(result.ok ? "" : result.error);
    if (result.ok) toast.push(t("community.settingsSaved"));
  }

  async function onDelete() {
    if (!window.confirm(t("community.deleteConfirm", { name: community.name }))) return;
    const result = await socialActions.deleteCommunity(meId, community.id);
    if (!result.ok) {
      toast.push(result.error);
      return;
    }
    toast.push(t("community.deleted"));
    router.push("/community");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("community.settingsTitle")}
          description={t("community.settingsHint")}
        />
        <CardBody>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <TextField
              id="settings-name"
              label={t("community.name")}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
            <TextAreaField
              id="settings-description"
              label={t("community.description")}
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
            <CategorySelect id="settings-category" value={category} onChange={setCategory} />
            <div className="space-y-1.5">
              <label
                htmlFor="settings-language"
                className="block text-sm font-medium text-cova-ink"
              >
                {t("community.language")}
              </label>
              <p className="text-xs text-cova-mute">{t("community.languageHint")}</p>
              <select
                id="settings-language"
                value={communityLocale}
                onChange={(e) => setCommunityLocale(e.target.value as CommunityLocale)}
                className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink"
              >
                <option value="">—</option>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l as Locale]}
                  </option>
                ))}
              </select>
            </div>
            <ChoiceGroup
              legend={t("community.joinQuestionSettings")}
              value={visibility}
              onChange={setVisibility}
              choices={visibilityChoices}
            />
            <ChoiceGroup
              legend={t("community.postingQuestion")}
              value={postingPolicy}
              onChange={setPostingPolicy}
              choices={postingChoices}
            />
            {visibility === "public" && community.visibility === "private" && (
              <p className="text-xs text-cova-mute">{t("community.publicAdmitsWaiting")}</p>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-red-800">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit">{t("community.saveChanges")}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("community.deleteTitle")} description={t("community.deleteHint")} />
        <CardBody>
          <Button variant="danger" onClick={onDelete}>
            {t("community.deleteButton")}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
