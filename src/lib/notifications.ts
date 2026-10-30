import type { MessageKey, TFunction } from "@/i18n/translate";
import type { SocialNotification, SocialUser } from "@/types/social";

/**
 * Turns a database notification row into a translated sentence. The row carries
 * only the kind plus the dynamic parts (`text`, `detail`, actor id), so the same
 * event is worded in the reader's language.
 */
const KIND_KEYS: Record<string, MessageKey> = {
  friend_request: "notif.friend_request",
  friend_accepted: "notif.friend_accepted",
  join_request: "notif.join_request",
  join_request_approved: "notif.join_request_approved",
  join_request_denied: "notif.join_request_denied",
  member_joined: "notif.member_joined",
  member_removed: "notif.member_removed",
  role_changed: "notif.role_changed",
  assignment_created: "notif.assignment_created",
  assignment_graded: "notif.assignment_graded",
  xp_earned: "notif.xp_earned",
  resource_added: "notif.resource_added",
};

/** Kinds whose `detail` (course name) may be empty and then read better without it. */
const OPTIONAL_DETAIL = new Set(["assignment_created", "resource_added"]);

export function notificationSentence(
  n: SocialNotification,
  users: Record<string, SocialUser>,
  t: TFunction,
): string {
  const actor = n.actorId ? users[n.actorId]?.displayName ?? n.actorId : "";
  const key = KIND_KEYS[n.kind];
  if (!key) return n.text || t("notif.fallback");
  if (OPTIONAL_DETAIL.has(n.kind) && !n.detail) {
    const plain: MessageKey =
      n.kind === "assignment_created" ? "notif.assignment_created_plain" : "notif.resource_added_plain";
    return t(plain, { actor, text: n.text, detail: n.detail });
  }
  return t(key, { actor, text: n.text, detail: n.detail });
}
