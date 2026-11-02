"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  MessageSquare,
  SearchX,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getStudent } from "@/data/students";
import { copyText } from "@/lib/clipboard";
import {
  friendsOf,
  incomingRequests,
  outgoingRequests,
  relationStatus,
  searchUsers,
  socialActions,
  useSocial,
} from "@/lib/social-store";
import type { SocialUser } from "@/types/social";

function PersonName({ user }: { user: SocialUser }) {
  const t = useT();
  const hasProfile = !!getStudent(user.id);
  return (
    <div className="min-w-0">
      {hasProfile ? (
        <Link
          href={`/community/${user.id}`}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {user.displayName}
        </Link>
      ) : (
        <p className="truncate text-sm font-semibold">{user.displayName}</p>
      )}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-cova-mute">
        <span className="font-mono">{user.id}</span>
        {user.sample && <Badge tone="outline">{t("people.sample")}</Badge>}
      </p>
      {user.headline && <p className="line-clamp-1 text-xs text-cova-mute">{user.headline}</p>}
    </div>
  );
}

function PersonRow({ user, meId }: { user: SocialUser; meId: string }) {
  const toast = useToast();
  const social = useSocial();
  const status = relationStatus(social, meId, user.id);

  async function run(pending: Promise<{ ok: boolean; error?: string }>, message: string) {
    const result = await pending;
    toast.push(result.ok ? message : (result.error ?? "Something went wrong."));
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={user.displayName} tone={user.tone} size="md" />
        <PersonName user={user} />
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {status === "none" && (
          <Button
            size="sm"
            onClick={() =>
              run(
                socialActions.sendFriendRequest(meId, user.id),
                `Request sent to ${user.displayName}`,
              )
            }
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Add friend
          </Button>
        )}
        {status === "sent" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run(socialActions.removeFriendship(meId, user.id), "Request cancelled")}
          >
            <X className="h-4 w-4" aria-hidden="true" /> Cancel request
          </Button>
        )}
        {status === "received" && (
          <>
            <Button
              size="sm"
              onClick={() =>
                run(
                  socialActions.respondFriendRequest(meId, user.id, true),
                  `You and ${user.displayName} are now friends`,
                )
              }
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Accept
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                run(socialActions.respondFriendRequest(meId, user.id, false), "Request declined")
              }
            >
              Decline
            </Button>
          </>
        )}
        {status === "friends" && (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Remove ${user.displayName} from friends`}
            onClick={() => {
              if (window.confirm(`Remove ${user.displayName} from your friends?`))
                run(socialActions.removeFriendship(meId, user.id), "Friend removed");
            }}
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" /> Friends
          </Button>
        )}
        <Link
          href={`/messages?to=${encodeURIComponent(user.id)}`}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> Message
        </Link>
      </div>
    </li>
  );
}

function PeopleList({ title, users, meId }: { title: string; users: SocialUser[]; meId: string }) {
  if (users.length === 0) return null;
  return (
    <Card>
      <CardHeader title={title} />
      <ul className="mt-2 divide-y divide-cova-line">
        {users.map((u) => (
          <PersonRow key={u.id} user={u} meId={meId} />
        ))}
      </ul>
    </Card>
  );
}

export function PeopleHub({ me }: { me: SocialUser }) {
  const toast = useToast();
  const t = useT();
  const social = useSocial();
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchUsers(social, me.id, query), [social, me.id, query]);
  const friends = useMemo(() => friendsOf(social, me.id), [social, me.id]);
  const incoming = useMemo(() => incomingRequests(social, me.id), [social, me.id]);
  const outgoing = useMemo(() => outgoingRequests(social, me.id), [social, me.id]);
  const searching = query.trim().length > 0;

  // Search runs on the server; results join the cache that searchUsers() ranks.
  useEffect(() => {
    if (query.trim().replace(/^@/, "").length < 2) return;
    const timer = setTimeout(() => void socialActions.searchPeople(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t("messages.shareId")}</p>
            <p className="font-mono text-lg font-semibold">{me.id}</p>
            <p className="text-xs text-cova-mute">
              {t("people.shareHint", { name: me.displayName })}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={async () =>
              toast.push(
                (await copyText(me.id))
                  ? "ID copied"
                  : "Couldn't copy. Select it and copy it manually.",
              )
            }
          >
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy ID
          </Button>
        </CardBody>
      </Card>

      <SearchInput
        label="Find people"
        placeholder="Find people by name or ID"
        value={query}
        onChange={setQuery}
        className="max-w-xl"
      />

      {searching ? (
        query.trim().replace(/^@/, "").length < 2 ? (
          <p className="text-sm text-cova-mute">{t("people.tooShort")}</p>
        ) : results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t("people.nobodyTitle")}
            description={t("people.nobodyDesc")}
          />
        ) : (
          <Card>
            <ul className="divide-y divide-cova-line" aria-label={t("people.results")}>
              {results.map((u) => (
                <PersonRow key={u.id} user={u} meId={me.id} />
              ))}
            </ul>
          </Card>
        )
      ) : (
        <>
          <PeopleList title="Friend requests" users={incoming} meId={me.id} />
          <PeopleList title="Requests you sent" users={outgoing} meId={me.id} />
          {friends.length > 0 ? (
            <PeopleList title={`Friends (${friends.length})`} users={friends} meId={me.id} />
          ) : (
            <EmptyState
              icon={UserMinus}
              title="No friends yet"
              description="Search by name or ID above to add friends or start a private chat."
            />
          )}
        </>
      )}
    </div>
  );
}
