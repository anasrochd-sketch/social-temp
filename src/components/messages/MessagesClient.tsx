"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, MessageSquare, Plus, Send, UserPlus, X } from "lucide-react";
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
  LIMITS,
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
import type { SocialUser } from "@/types/social";

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
  const [draft, setDraft] = useState("");
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

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const result = await socialActions.sendDirectMessage(meId, selected.id, draft);
    if (!result.ok) {
      toast.push(result.error);
      return;
    }
    setDraft("");
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
                <li className="px-4 pt-3 text-xs font-medium text-cova-mute">{t("messages.yourFriends")}</li>
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
                      <span className="block truncate font-mono text-xs text-cova-mute">{u.id}</span>
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
              {visibleThreads.map((t) => {
                const name = t.other?.displayName ?? "Unknown person";
                const active = t.otherId === selected?.id;
                return (
                  <li key={t.otherId}>
                    <button
                      type="button"
                      onClick={() => open(t.otherId)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-cova-bg",
                        active && "bg-cova-pale",
                      )}
                    >
                      <Avatar name={name} tone={t.other?.tone} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{name}</span>
                          <span className="shrink-0 text-xs text-cova-mute">
                            {formatWhen(t.last.at)}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-cova-mute">
                          {t.last.fromId === meId && "You: "}
                          {t.last.text}
                        </span>
                      </span>
                      {t.unread > 0 && !active && (
                        <span className="rounded-full bg-cova-soft px-2 py-0.5 text-xs font-medium">
                          {t.unread}
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
                {relation === "none" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const result = await socialActions.sendFriendRequest(meId, selected.id);
                      toast.push(result.ok ? `${t("messages.requestSent")} ${firstName}` : result.error);
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
                      const result = await socialActions.respondFriendRequest(meId, selected.id, true);
                      toast.push(result.ok ? `${t("messages.youAreNowFriends")} ${firstName}` : result.error);
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
                  <div
                    key={m.id}
                    className={cn("flex", m.fromId === meId ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                        m.fromId === meId ? "bg-cova-soft" : "border border-cova-line bg-white",
                      )}
                    >
                      <p className="whitespace-pre-line break-words">{m.text}</p>
                      <p className="mt-1 text-[11px] text-cova-ink/70">{formatWhen(m.at)}</p>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-cova-line p-3">
                <input
                  aria-label={t("messages.message")}
                  value={draft}
                  maxLength={LIMITS.text.max}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`${t("messages.message")} ${firstName}`}
                  className="h-10 flex-1 rounded-lg border border-cova-line px-3 text-sm placeholder:text-cova-mute"
                />
                <Button type="submit" disabled={!draft.trim()}>
                  <Send className="h-4 w-4" aria-hidden="true" /> {t("messages.send")}
                </Button>
              </form>
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
