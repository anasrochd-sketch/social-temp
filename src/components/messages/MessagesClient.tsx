"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Phone, Plus, UserPlus, Video, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { getStudent } from "@/data/students";
import { useT } from "@/i18n/client";
import { useHydrated } from "@/lib/use-hydrated";
import {
  formatWhen,
  friendsOf,
  listThreads,
  relationStatus,
  searchUsers,
  socialActions,
  threadMessages,
  useMe,
  useSocial,
} from "@/lib/social-store";
import { cn, matchesQuery } from "@/lib/utils";
import type { PostAttachment, SocialUser } from "@/types/social";
import { ChatComposer } from "@/components/messages/ChatComposer";
import { ChatMessageBubble } from "@/components/messages/ChatMessageBubble";
import { callActions } from "@/lib/call";

export function MessagesClient({ initialTo }: { initialTo?: string }) {
  const toast = useToast();
  const t = useT();
  const hydrated = useHydrated();
  const me = useMe();
  const social = useSocial();
  const meId = me?.id ?? "";

  const [selectedId, setSelectedId] = useState<string | null>(initialTo ?? null);
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const threads = useMemo(() => (meId ? listThreads(social, meId) : []), [social, meId]);

  const visibleThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          !query.trim() ||
          matchesQuery(
            query,
            t.other?.displayName ?? "",
            threadMessages(social, meId, t.otherId).map((m) => m.text),
          ),
      ),
    [threads, social, meId, query],
  );

  const peopleResults = useMemo(() => {
    if (!meId) return [];
    return peopleQuery.trim() ? searchUsers(social, meId, peopleQuery) : friendsOf(social, meId);
  }, [social, meId, peopleQuery]);

  const selected: SocialUser | undefined =
    selectedId && selectedId !== meId ? social.users[selectedId] : undefined;
  const messages = useMemo(
    () => (selected && meId ? threadMessages(social, meId, selected.id) : []),
    [social, meId, selected],
  );
  const lastAt = messages[messages.length - 1]?.at ?? 0;
  const selectedKey = selected?.id ?? "";

  useEffect(() => {
    if (meId && selectedKey) socialActions.markThreadRead(meId, selectedKey);
  }, [meId, selectedKey, lastAt]);

  // /messages?to=COVA-XXXXXX can name someone who isn't cached yet (not a friend, no chat).
  useEffect(() => {
    if (meId && selectedId && selectedId !== meId) void socialActions.lookupUser(selectedId);
  }, [meId, selectedId]);

  // "New chat" search runs on the server; results join the cache that searchUsers() ranks.
  useEffect(() => {
    if (peopleQuery.trim().replace(/^@/, "").length < 2) return;
    const timer = setTimeout(() => void socialActions.searchPeople(peopleQuery), 250);
    return () => clearTimeout(timer);
  }, [peopleQuery]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [selectedKey, lastAt]);

  if (!hydrated || !me) return <Skeleton className="h-96 w-full" />;

  function open(id: string) {
    setSelectedId(id);
    setComposing(false);
    setPeopleQuery("");
  }

  /** Label shown in the thread list when the last message is a photo / voice note / file. */
  function previewLabel(attachments: PostAttachment[]): string {
    const first = attachments[0];
    if (!first) return "";
    if (first.kind === "image") return t("messages.photo");
    if (first.kind === "audio") return t("messages.voiceNote");
    if (first.kind === "video") return t("messages.video");
    return t("messages.file");
  }

  async function send(text: string, attachments: PostAttachment[]) {
    if (!selected) return { ok: false as const, error: t("messages.selectConversation") };
    const result = await socialActions.sendDirectMessage(meId, selected.id, text, attachments);
    if (!result.ok) toast.push(result.error);
    return result;
  }

  const relation = selected ? relationStatus(social, meId, selected.id) : "none";
  const selectedProfile = selected ? getStudent(selected.id) : undefined;
  const firstName = selected?.displayName.split(" ")[0] ?? "";

  return (
    <div>
      <div className="mb-3">
        <DemoNotice>
          Messages are delivered between accounts in real time. Sample students never reply.
        </DemoNotice>
      </div>
      <div className="grid h-[calc(100vh-17rem)] min-h-[28rem] overflow-hidden rounded-xl border border-cova-line bg-white md:grid-cols-[18rem_1fr]">
        <section
          aria-label="Conversations"
          className={cn(
            "flex min-h-0 flex-col border-cova-line md:border-e",
            selected && "hidden md:flex",
          )}
        >
          <div className="space-y-2 border-b border-cova-line p-3">
            {composing ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{t("messages.newChat")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setPeopleQuery("");
                    }}
                    aria-label={t("messages.newChat")}
                    className="rounded-lg p-1 hover:bg-cova-pale"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <SearchInput
                  label={t("messages.findPerson")}
                  placeholder={t("messages.searchByNameOrId")}
                  value={peopleQuery}
                  onChange={setPeopleQuery}
                />
              </>
            ) : (
              <>
                <Button size="sm" className="w-full" onClick={() => setComposing(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> {t("messages.newChat")}
                </Button>
                <SearchInput
                  label={t("messages.searchConversations")}
                  placeholder={t("messages.searchConversations")}
                  value={query}
                  onChange={setQuery}
                />
              </>
            )}
          </div>

          {composing ? (
            <ul className="flex-1 overflow-y-auto">
              {!peopleQuery.trim() && peopleResults.length > 0 && (
                <li className="px-4 pt-3 text-xs font-medium text-cova-mute">
                  {t("messages.yourFriends")}
                </li>
              )}
              {peopleResults.length === 0 && (
                <li className="p-4 text-sm text-cova-mute">
                  {peopleQuery.trim().length < 2
                    ? t("messages.typeAtLeastTwo")
                    : t("messages.nobodyFound")}
                </li>
              )}
              {peopleResults.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => open(u.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-cova-bg"
                  >
                    <Avatar name={u.displayName} tone={u.tone} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                      <span className="block truncate font-mono text-xs text-cova-mute">
                        {u.id}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {visibleThreads.length === 0 && (
                <li className="p-4 text-sm text-cova-mute">
                  {threads.length === 0
                    ? t("messages.noConversationsYet")
                    : t("messages.noConversationsMatch")}
                </li>
              )}
              {visibleThreads.map((thread) => {
                const name = thread.other?.displayName ?? "Unknown person";
                const active = thread.otherId === selected?.id;
                return (
                  <li key={thread.otherId}>
                    <button
                      type="button"
                      onClick={() => open(thread.otherId)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-cova-bg",
                        active && "bg-cova-pale",
                      )}
                    >
                      <Avatar name={name} tone={thread.other?.tone} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{name}</span>
                          <span className="shrink-0 text-xs text-cova-mute">
                            {formatWhen(thread.last.at)}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-cova-mute">
                          {thread.last.fromId === meId && `${t("messages.youPrefix")} `}
                          {thread.last.text || previewLabel(thread.last.attachments)}
                        </span>
                      </span>
                      {thread.unread > 0 && !active && (
                        <span className="rounded-full bg-cova-soft px-2 py-0.5 text-xs font-medium">
                          {thread.unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-label="Conversation"
          className={cn("flex min-h-0 flex-col", !selected && "hidden md:flex")}
        >
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-cova-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label={t("messages.backToConversations")}
                  className="rounded-lg p-1.5 hover:bg-cova-pale md:hidden"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <Avatar name={selected.displayName} tone={selected.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {selectedProfile ? (
                      <Link href={`/community/${selected.id}`} className="truncate hover:underline">
                        {selected.displayName}
                      </Link>
                    ) : (
                      <span className="truncate">{selected.displayName}</span>
                    )}
                    {selected.sample && <Badge tone="outline">{t("messages.sample")}</Badge>}
                  </p>
                  <p className="truncate font-mono text-xs text-cova-mute">{selected.id}</p>
                </div>
                {meId && !selected.sample && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("call.audio")}
                      title={t("call.audio")}
                      onClick={() =>
                        void callActions.startCall(
                          {
                            publicId: selected.id,
                            displayName: selected.displayName,
                            tone: selected.tone,
                          },
                          "audio",
                        )
                      }
                      className="rounded-full p-2 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("call.video")}
                      title={t("call.video")}
                      onClick={() =>
                        void callActions.startCall(
                          {
                            publicId: selected.id,
                            displayName: selected.displayName,
                            tone: selected.tone,
                          },
                          "video",
                        )
                      }
                      className="rounded-full p-2 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
                    >
                      <Video className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {relation === "none" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const result = await socialActions.sendFriendRequest(meId, selected.id);
                      toast.push(
                        result.ok ? `${t("messages.requestSent")} ${firstName}` : result.error,
                      );
                    }}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" /> {t("messages.addFriend")}
                  </Button>
                )}
                {relation === "sent" && <Badge tone="outline">{t("messages.requestSent")}</Badge>}
                {relation === "received" && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await socialActions.respondFriendRequest(
                        meId,
                        selected.id,
                        true,
                      );
                      toast.push(
                        result.ok ? `${t("messages.youAreNowFriends")} ${firstName}` : result.error,
                      );
                    }}
                  >
                    {t("messages.acceptRequest")}
                  </Button>
                )}
                {relation === "friends" && <Badge tone="soft">{t("messages.friends")}</Badge>}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-cova-bg p-4">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-cova-mute">
                    {t("messages.noMessagesYet")} {firstName}.
                  </p>
                )}
                {messages.map((m) => (
                  <ChatMessageBubble
                    key={m.id}
                    message={m}
                    mine={m.fromId === meId}
                    time={formatWhen(m.at)}
                  />
                ))}
                <div ref={endRef} />
              </div>
              <ChatComposer
                onSend={send}
                placeholder={`${t("messages.message")} ${firstName}`}
                label={t("messages.message")}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={MessageSquare}
                title={t("messages.selectConversation")}
                description={t("messages.chooseConversation")}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
