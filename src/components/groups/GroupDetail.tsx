"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed, Send, Users } from "lucide-react";
import { MediaComposer } from "@/components/common/MediaComposer";
import { PostAttachments } from "@/components/common/PostAttachments";
import { SharePanel } from "@/components/common/SharePanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { PostAttachment } from "@/types/social";

type Group = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  visibility: "public" | "private";
  post_policy: string;
  owner_id: string;
};

type GroupMessage = {
  id: string;
  space_id: string;
  author_id: string;
  body: string;
  attachments?: PostAttachment[] | null;
  created_at: string;
};

type MemberRole = "owner" | "admin" | "member";

/** Supabase errors lose their message when thrown around — always surface a real text. */
const errText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export function GroupDetail({ code, joinParam = "" }: { code: string; joinParam?: string }) {
  const router = useRouter();
  const t = useT();

  const [userId, setUserId] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PostAttachment[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Charger les publications depuis space_posts
  const loadMessages = useCallback(async (spaceId: string) => {
    const supabase = getSupabase();

    const { data, error: queryError } = await supabase
      .from("space_posts")
      .select("id,space_id,author_id,body,attachments,created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: true });

    if (queryError) {
      // Older databases have no attachments column yet: retry without it.
      const fallback = await supabase
        .from("space_posts")
        .select("id,space_id,author_id,body,created_at")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: true });
      if (fallback.error) throw fallback.error;
      setMessages((fallback.data ?? []) as GroupMessage[]);
      return;
    }

    setMessages((data ?? []) as GroupMessage[]);
  }, []);

  // Charger le groupe et le rôle de l'utilisateur
  const loadGroup = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabase();

      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setUserId("");
        setGroup(null);
        setRole(null);
        setMessages([]);
        setError(t("groupDetail.signIn"));
        return;
      }

      const currentUserId = authData.user.id;
      setUserId(currentUserId);

      const { data: groupData, error: groupError } = await supabase
        .from("spaces")
        .select("id,name,description,category,visibility,post_policy,owner_id")
        .eq("id", code)
        .eq("kind", "group")
        .maybeSingle();

      if (groupError) throw groupError;

      if (!groupData) {
        setGroup(null);
        setRole(null);
        setMessages([]);
        setError(t("groupDetail.notFoundDesc"));
        return;
      }

      const currentGroup = groupData as Group;
      setGroup(currentGroup);

      const { data: membership, error: membershipError } = await supabase
        .from("space_members")
        .select("role")
        .eq("space_id", currentGroup.id)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (membershipError) throw membershipError;

      // Le propriétaire est reconnu même si sa ligne de membre
      // n'a pas encore été créée dans space_members.
      const memberRole: MemberRole | null =
        currentGroup.owner_id === currentUserId
          ? "owner"
          : membership?.role === "admin"
            ? "admin"
            : membership?.role
              ? "member"
              : null;

      setRole(memberRole);

      // Staff can also see the invite code to share it.
      if (memberRole === "owner" || memberRole === "admin") {
        const { data: codeRow } = await supabase
          .from("join_codes")
          .select("code")
          .eq("kind", "space")
          .eq("target_id", currentGroup.id)
          .maybeSingle();
        setInviteCode(codeRow?.code ?? "");
      }

      if (!memberRole) {
        setMessages([]);
        return;
      }

      await loadMessages(currentGroup.id);
    } catch (err) {
      console.error("Error loading group:", err);
      setError(errText(err, t("groupDetail.notFoundDesc")));
    } finally {
      setLoading(false);
    }
  }, [code, loadMessages, t]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadGroup();
    });

    return () => cancelAnimationFrame(frame);
  }, [loadGroup]);

  // Opened through an invite link (?join=CODE): join by that code once,
  // even when RLS hides a private group until the membership exists.
  const joinAttemptRef = useRef("");
  useEffect(() => {
    const wanted = joinParam.trim().toUpperCase();
    if (loading || !wanted || joinAttemptRef.current === wanted) return;
    joinAttemptRef.current = wanted;

    void (async () => {
      try {
        const supabase = getSupabase();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return; // the sign-in hint is already on screen

        const { data, error: rpcError } = await supabase.rpc("join_by_code", {
          p_code: wanted,
        });
        if (rpcError) throw rpcError;

        const result = data as { communityId?: string; outcome?: string } | null;
        if (result?.communityId && group && result.communityId !== group.id) {
          router.replace(`/groups/${result.communityId}`);
          return;
        }

        setNotice(
          result?.outcome === "requested"
            ? t("group.joinRequested")
            : result?.outcome === "already-member"
              ? t("group.alreadyMember")
              : t("group.joined"),
        );
        await loadGroup();
      } catch (err) {
        // Wrong or expired code: keep the regular page instead of an error screen.
        console.error("Invite auto-join failed:", err);
      }
    })();
  }, [joinParam, loading, group, loadGroup, router, t]);

  // Actualiser les publications en temps réel
  useEffect(() => {
    if (!group || !role) return;

    const supabase = getSupabase();

    const channel = supabase
      .channel(`space-posts-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "space_posts",
          filter: `space_id=eq.${group.id}`,
        },
        () => {
          void loadMessages(group.id).catch((err: unknown) => {
            setError(errText(err, t("groupDetail.postError")));
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [group, role, loadMessages, t]);

  const isStaff = role === "owner" || role === "admin";

  // "members" (legacy) and "everyone" both mean every member can post.
  const canPost =
    !!role &&
    (group?.post_policy === "members" || group?.post_policy === "everyone"
      ? true
      : group?.post_policy === "admins" || group?.post_policy === "admins_only"
        ? isStaff
        : role === "owner");

  // Rejoindre un groupe public
  const joinGroup = async () => {
    if (!group || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (group.visibility !== "public") {
        setError(t("groupDetail.joinPrivateError"));
        return;
      }

      const supabase = getSupabase();

      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) throw new Error(authError.message);
      if (!authData.user) {
        throw new Error(t("group.signInToJoin"));
      }

      // Preferred path: security-definer RPC (works no matter how RLS is configured).
      const { data: rpcData, error: rpcError } = await supabase.rpc("join_space", {
        p_space: group.id,
      });

      if (!rpcError && rpcData) {
        const result = rpcData as { ok?: boolean; error?: string; outcome?: string };
        if (result.ok === false) throw new Error(result.error || t("groupDetail.joinError"));
        setNotice(
          result.outcome === "requested" ? t("group.joinRequested") : t("groupDetail.joined"),
        );
        await loadGroup();
        return;
      }

      // Older database without the RPC: direct insert.
      const { error: joinError } = await supabase.from("space_members").insert({
        space_id: group.id,
        user_id: authData.user.id,
        role: "member",
      });

      if (joinError) throw new Error(joinError.message);

      setNotice(t("groupDetail.joined"));
      await loadGroup();
    } catch (err) {
      console.error("Error joining group:", err);
      setError(errText(err, t("groupDetail.joinError")));
    } finally {
      setBusy(false);
    }
  };

  // Publier un message dans space_posts
  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = text.trim();

    if (!group || (!body && attachments.length === 0) || !canPost || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();

      const payload: Record<string, unknown> = {
        space_id: group.id,
        author_id: userId,
        body,
      };
      if (attachments.length > 0) payload.attachments = attachments;

      const { error: insertError } = await supabase.from("space_posts").insert(payload);

      if (insertError) {
        // Retry without media when the database does not have the column yet.
        if (attachments.length > 0) {
          const { error: retryError } = await supabase
            .from("space_posts")
            .insert({ space_id: group.id, author_id: userId, body });
          if (retryError) throw insertError;
          setError(
            "Media storage is not active yet. Ask the project owner to run the SQL setup (see docs/COMMUNITY_GROUPS_UPDATE.md).",
          );
        } else {
          throw insertError;
        }
      }

      setText("");
      setAttachments([]);
      await loadMessages(group.id);
    } catch (err) {
      console.error("Error posting message:", err);
      setError(errText(err, t("groupDetail.postError")));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-12 text-center text-sm text-cova-mute">{t("groupDetail.loading")}</p>;
  }

  if (!group) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("groupDetail.notFound")}
        description={error || t("groupDetail.notFoundDesc")}
        action={<Button onClick={() => router.push("/groups")}>{t("groupDetail.back")}</Button>}
      />
    );
  }

  const roleLabel =
    role === "owner"
      ? t("community.roleOwner")
      : role === "admin"
        ? t("community.roleAdmin")
        : role === "member"
          ? t("community.roleMember")
          : t("groupDetail.notMember");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <div className="mb-3">
          <h1 className="truncate text-xl font-semibold">{group.name}</h1>

          {group.description && <p className="text-sm text-cova-mute">{group.description}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cova-mute">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {group.visibility === "public" ? t("community.public") : t("community.private")}
            </span>

            {group.category && <span>· {group.category}</span>}
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="mb-3 rounded-lg bg-cova-pale p-3 text-sm">
            {notice}
          </p>
        )}

        {!role ? (
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">{t("groupDetail.joinTitle")}</h2>

            <p className="text-sm text-cova-mute">
              {group.visibility === "public"
                ? t("groupDetail.joinPublicHint")
                : t("groupDetail.joinPrivateHint")}
            </p>

            {group.visibility === "public" && (
              <Button onClick={() => void joinGroup()} disabled={busy}>
                {busy ? t("group.joining") : t("groupDetail.join")}
              </Button>
            )}
          </Card>
        ) : (
          <Card className="flex h-[30rem] flex-col sm:h-[36rem]">
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {messages.length === 0 && (
                <p className="py-10 text-center text-sm text-cova-mute">
                  {t("groupDetail.noMessages")}
                </p>
              )}

              {messages.map((message) => {
                const mine = message.author_id === userId;

                return (
                  <div
                    key={message.id}
                    className={cn("flex flex-col", mine ? "items-end" : "items-start")}
                  >
                    <span className="mb-0.5 text-xs text-cova-mute">
                      {mine
                        ? t("groupDetail.you")
                        : t("groupDetail.member", { id: message.author_id.slice(0, 6) })}
                      {" · "}
                      {new Date(message.created_at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                        mine ? "bg-cova-soft" : "bg-cova-pale",
                      )}
                    >
                      {message.body && (
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      )}
                      <PostAttachments attachments={message.attachments ?? []} />
                    </div>
                  </div>
                );
              })}
            </div>

            {canPost ? (
              <form
                className="space-y-1 border-t border-cova-line p-3"
                onSubmit={(event) => void submitMessage(event)}
              >
                <div className="flex gap-2">
                  <input
                    value={text}
                    maxLength={5000}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={t("groupDetail.writeMessage")}
                    aria-label={t("groupDetail.writeMessage")}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-cova-line px-3 text-sm"
                  />

                  <Button
                    type="submit"
                    disabled={(!text.trim() && attachments.length === 0) || busy}
                  >
                    <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                    {t("groupDetail.send")}
                  </Button>
                </div>
                <MediaComposer spaceId={group.id} disabled={busy} onChange={setAttachments} />
              </form>
            ) : (
              <p className="border-t border-cova-line p-3 text-center text-sm text-cova-mute">
                {t("groupDetail.cantPost")}
              </p>
            )}
          </Card>
        )}
      </div>

      <div className="space-y-3">
        {isStaff && (
          <SharePanel
            title={group.name}
            spaceId={group.id}
            code={inviteCode}
            path={`/groups/${group.id}`}
          />
        )}

        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">{t("groupDetail.settings")}</h2>

          <p className="text-sm text-cova-mute">
            {t("groupDetail.yourRole")}: {roleLabel}
          </p>

          <Button variant="secondary" className="w-full" onClick={() => router.push("/groups")}>
            {t("groupDetail.back")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
