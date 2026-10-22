"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Check, Copy, MessageSquare, RefreshCw, ShieldCheck, ShieldOff, UserX, X } from "lucide-react";
import {
  CategorySelect,
  POSTING_CHOICES,
  VISIBILITY_CHOICES,
} from "@/components/community/CreateCommunityModal";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChoiceGroup } from "@/components/community/ChoiceGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatWhen, isStaff, socialActions, useSocial } from "@/lib/social-store";
import type {
  Community,
  CommunityRole,
  CommunityVisibility,
  PostingPolicy,
} from "@/types/social";

const ROLE_RANK: Record<CommunityRole, number> = { owner: 0, admin: 1, member: 2 };
const ROLE_LABEL: Record<CommunityRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function RoleBadge({ role }: { role: CommunityRole }) {
  if (role === "member") return null;
  return <Badge tone={role === "owner" ? "soft" : "pale"}>{ROLE_LABEL[role]}</Badge>;
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
  const link = `${window.location.origin}/community?join=${community.joinCode}`;

  async function copy(text: string, what: string) {
    toast.push((await copyText(text)) ? `${what} copied` : "Couldn't copy. Select it and copy it manually.");
  }

  return (
    <Card>
      <CardHeader
        title="Invite people"
        description={
          community.visibility === "private"
            ? "People who use this code or link send a request that an admin must approve."
            : "Anyone with this code or link joins instantly because the community is public."
        }
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-cova-pale px-3 py-2 font-mono text-base font-semibold tracking-widest">
            {community.joinCode}
          </code>
          <Button size="sm" variant="secondary" onClick={() => copy(community.joinCode, "Code")}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy code
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copy(link, "Link")}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy link
          </Button>
          {canRegenerate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!window.confirm("The old code and link will stop working. Continue?")) return;
                const result = await socialActions.regenerateJoinCode(meId, community.id);
                toast.push(result.ok ? "New code created" : result.error);
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> New code
            </Button>
          )}
        </div>
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
        <CardHeader title={`Members (${members.length})`} />
        <ul className="mt-2 divide-y divide-cova-line">
          {members.map((m) => {
            const user = social.users[m.userId];
            const name = user?.displayName ?? "Former member";
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
                        {m.userId === meId && " (you)"}
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
                      <MessageSquare className="h-4 w-4" aria-hidden="true" /> Message
                    </Link>
                  )}
                  {myRole === "owner" && m.role === "member" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        report(
                          socialActions.setMemberRole(meId, community.id, m.userId, "admin"),
                          `${name} is now an admin`,
                        )
                      }
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Make admin
                    </Button>
                  )}
                  {myRole === "owner" && m.role === "admin" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        report(
                          socialActions.setMemberRole(meId, community.id, m.userId, "member"),
                          `${name} is no longer an admin`,
                        )
                      }
                    >
                      <ShieldOff className="h-4 w-4" aria-hidden="true" /> Remove admin
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Remove ${name} from this community?`))
                          report(
                            socialActions.removeMember(meId, community.id, m.userId),
                            `${name} was removed`,
                          );
                      }}
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" /> Remove
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
        title="No pending requests"
        description="When someone uses your invite code or link, their request shows up here for approval."
      />
    );

  return (
    <Card>
      <ul className="divide-y divide-cova-line">
        {requests.map((r) => {
          const user = social.users[r.userId];
          const name = user?.displayName ?? "Unknown person";
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
                    <span className="font-mono">{r.userId}</span> · asked {formatWhen(r.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    const result = await socialActions.decideJoinRequest(meId, r.id, true);
                    toast.push(result.ok ? `${name} joined` : result.error);
                  }}
                >
                  <Check className="h-4 w-4" aria-hidden="true" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const result = await socialActions.decideJoinRequest(meId, r.id, false);
                    toast.push(result.ok ? "Request declined" : result.error);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" /> Decline
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
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [category, setCategory] = useState(community.category);
  const [visibility, setVisibility] = useState<CommunityVisibility>(community.visibility);
  const [postingPolicy, setPostingPolicy] = useState<PostingPolicy>(community.postingPolicy);
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
    });
    setError(result.ok ? "" : result.error);
    if (result.ok) toast.push("Settings saved");
  }

  async function onDelete() {
    if (!window.confirm(`Delete "${community.name}" with all its posts? This can't be undone.`))
      return;
    const result = await socialActions.deleteCommunity(meId, community.id);
    if (!result.ok) {
      toast.push(result.error);
      return;
    }
    toast.push("Community deleted");
    router.push("/community");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Community settings" description="Only you, the creator, can change these." />
        <CardBody>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <TextField
              id="settings-name"
              label="Name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
            <TextAreaField
              id="settings-description"
              label="Description"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
            <CategorySelect id="settings-category" value={category} onChange={setCategory} />
            <ChoiceGroup
              legend="Who can find and join it?"
              value={visibility}
              onChange={setVisibility}
              choices={VISIBILITY_CHOICES}
            />
            <ChoiceGroup
              legend="Who can post?"
              value={postingPolicy}
              onChange={setPostingPolicy}
              choices={POSTING_CHOICES}
            />
            {visibility === "public" && community.visibility === "private" && (
              <p className="text-xs text-cova-mute">
                Making it public accepts everyone who is currently waiting for approval.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-red-800">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Delete community" description="Removes the community, its members and all posts." />
        <CardBody>
          <Button variant="danger" onClick={onDelete}>
            Delete this community
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
