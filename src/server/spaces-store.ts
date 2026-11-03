/**
 * In-memory hub for Voicing rooms (kind "voice") and group chats (kind "group").
 *
 * DEV / SINGLE-SERVER ONLY: state lives in the Node process and is lost on restart.
 * Identity (`uid`) is claimed by the client — there is no real auth yet. When the real
 * backend exists, replace this file with database + authenticated sessions.
 */

export type SpaceKind = "voice" | "group";
export type SpaceRole = "owner" | "mod" | "member";
export type MyStatus = SpaceRole | "pending" | "denied" | "none";

export interface Member {
  uid: string;
  name: string;
  role: SpaceRole;
  avatar: string;
  side: "left" | "right";
  muted: boolean;
  /** Moderator-set: this person cannot hear the room until restored. */
  deafened: boolean;
  joinedAt: number;
}
interface PendingReq {
  uid: string;
  name: string;
  avatar: string;
  side: "left" | "right";
  at: number;
}
export interface ChatMsg {
  id: string;
  uid: string;
  name: string;
  text: string;
  at: number;
}

/** One spoken sentence turned into text and shared with the room (live captions). */
export interface Caption {
  id: string;
  uid: string;
  name: string;
  /** Speech language of the speaker, e.g. "en-US". */
  lang: string;
  text: string;
  /** Optional pre-translated line the speaker chose to dub with TTS. */
  tt?: string;
  /** BCP-47 tag of `tt`, so listeners can read and speak it back. */
  tlang?: string;
  at: number;
}
interface Space {
  code: string;
  kind: SpaceKind;
  name: string;
  description: string;
  isPublic: boolean;
  ownerUid: string;
  createdAt: number;
  members: Map<string, Member>;
  pending: Map<string, PendingReq>;
  denied: Set<string>;
  banned: Set<string>;
  messages: ChatMsg[];
  captions: Caption[];
}

export interface SpaceSummary {
  code: string;
  kind: SpaceKind;
  name: string;
  description: string;
  isPublic: boolean;
  memberCount: number;
  createdAt: number;
}
export interface SpaceView extends SpaceSummary {
  status: MyStatus;
  members: Member[];
  pending: PendingReq[]; // only filled for owner / moderators
  messages: ChatMsg[]; // only filled for members
  captions: Caption[]; // latest live-translation lines, only filled for members
}

type Send = (event: string, data: unknown) => void;

interface Hub {
  spaces: Map<string, Space>;
  listeners: Map<string, Map<string, Set<Send>>>; // code -> uid -> senders
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
}
const g = globalThis as unknown as { __covaSpaceHub?: Hub };
const hub: Hub = (g.__covaSpaceHub ??= {
  spaces: new Map(),
  listeners: new Map(),
  graceTimers: new Map(),
});

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function newCode(): string {
  for (;;) {
    let c = "";
    for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!hub.spaces.has(c)) return c;
  }
}
export const normalizeCode = (c: string) =>
  c
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const canModerate = (m?: Member) => m?.role === "owner" || m?.role === "mod";

function summary(s: Space): SpaceSummary {
  return {
    code: s.code,
    kind: s.kind,
    name: s.name,
    description: s.description,
    isPublic: s.isPublic,
    memberCount: s.members.size,
    createdAt: s.createdAt,
  };
}

export function viewFor(s: Space, uid: string): SpaceView {
  const me = s.members.get(uid);
  const status: MyStatus = me
    ? me.role
    : s.pending.has(uid)
      ? "pending"
      : s.denied.has(uid)
        ? "denied"
        : "none";
  return {
    ...summary(s),
    status,
    members: me ? [...s.members.values()] : [],
    pending: canModerate(me) ? [...s.pending.values()] : [],
    messages: me ? s.messages.slice(-200) : [],
    captions: me ? s.captions.slice(-20) : [],
  };
}

function push(code: string, uid: string, event: string, data: unknown) {
  hub.listeners
    .get(code)
    ?.get(uid)
    ?.forEach((send) => send(event, data));
}
function broadcast(s: Space) {
  const byUid = hub.listeners.get(s.code);
  if (!byUid) return;
  const uids = new Set<string>([...byUid.keys()]);
  uids.forEach((uid) => push(s.code, uid, "state", viewFor(s, uid)));
}

/* ---------- queries ---------- */
export function listSpaces(opts: {
  kind: SpaceKind;
  q?: string;
  mineUid?: string;
}): SpaceSummary[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return [...hub.spaces.values()]
    .filter((s) => s.kind === opts.kind)
    .filter((s) =>
      opts.mineUid ? s.members.has(opts.mineUid) || s.pending.has(opts.mineUid) : s.isPublic,
    )
    .filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
    .map(summary)
    .sort((a, b) => b.memberCount - a.memberCount || b.createdAt - a.createdAt)
    .slice(0, 50);
}

export function getView(code: string, uid: string): SpaceView | null {
  const s = hub.spaces.get(normalizeCode(code));
  return s ? viewFor(s, uid) : null;
}

/* ---------- mutations ---------- */
export function createSpace(input: {
  kind: SpaceKind;
  name: string;
  description?: string;
  isPublic: boolean;
  ownerUid: string;
}): SpaceSummary | { error: string } {
  const name = clean(input.name, 60);
  if (name.length < 2) return { error: "name_too_short" };
  if (!input.ownerUid) return { error: "no_uid" };
  const s: Space = {
    code: newCode(),
    kind: input.kind,
    name,
    description: clean(input.description, 200),
    isPublic: !!input.isPublic,
    ownerUid: input.ownerUid,
    createdAt: Date.now(),
    members: new Map(),
    pending: new Map(),
    denied: new Set(),
    banned: new Set(),
    messages: [],
    captions: [],
  };
  hub.spaces.set(s.code, s);
  return summary(s);
}

export interface ActionInput {
  type: string;
  uid: string;
  name?: string;
  avatar?: string;
  side?: string;
  target?: string;
  role?: string;
  isPublic?: boolean;
  muted?: boolean;
  /** Deafen toggle for the "deafen" action. */
  value?: boolean;
  text?: string;
  lang?: string;
  /** Pre-translated caption line (speaker dubbing). */
  tt?: string;
  /** BCP-47 tag of `tt`. */
  tlang?: string;
  to?: string;
  payload?: unknown;
}

export function act(
  codeRaw: string,
  a: ActionInput,
): { ok: true; view: SpaceView } | { ok: false; error: string } {
  const s = hub.spaces.get(normalizeCode(codeRaw));
  if (!s) return { ok: false, error: "not_found" };
  const uid = clean(a.uid, 80);
  if (!uid) return { ok: false, error: "no_uid" };
  const me = s.members.get(uid);
  const side = a.side === "right" ? "right" : "left";
  const done = () => {
    broadcast(s);
    return { ok: true as const, view: viewFor(s, uid) };
  };
  const target = a.target ? s.members.get(a.target) : undefined;

  switch (a.type) {
    case "join": {
      if (me) return done();
      if (s.banned.has(uid)) return { ok: false, error: "banned" };
      const name = clean(a.name, 40) || "Guest";
      const avatar = clean(a.avatar, 30) || "robot";
      if (uid === s.ownerUid || s.isPublic) {
        s.members.set(uid, {
          uid,
          name,
          avatar,
          side,
          muted: false,
          deafened: false,
          joinedAt: Date.now(),
          role: uid === s.ownerUid ? "owner" : "member",
        });
        s.pending.delete(uid);
        s.denied.delete(uid);
      } else {
        s.denied.delete(uid);
        s.pending.set(uid, { uid, name, avatar, side, at: Date.now() });
      }
      return done();
    }
    case "cancel": {
      s.pending.delete(uid);
      return done();
    }
    case "leave": {
      s.members.delete(uid);
      s.pending.delete(uid);
      if (s.kind === "voice" && s.members.size === 0) hub.spaces.delete(s.code);
      return done();
    }
    case "approve":
    case "deny": {
      if (!canModerate(me) || !a.target) return { ok: false, error: "forbidden" };
      const req = s.pending.get(a.target);
      if (!req) return done();
      s.pending.delete(a.target);
      if (a.type === "approve") {
        s.members.set(req.uid, {
          uid: req.uid,
          name: req.name,
          avatar: req.avatar,
          side: req.side,
          muted: false,
          deafened: false,
          joinedAt: Date.now(),
          role: "member",
        });
      } else s.denied.add(req.uid);
      return done();
    }
    case "kick": {
      if (!canModerate(me) || !target || target.role === "owner")
        return { ok: false, error: "forbidden" };
      if (me!.role === "mod" && target.role === "mod") return { ok: false, error: "forbidden" };
      s.members.delete(target.uid);
      s.banned.add(target.uid);
      push(s.code, target.uid, "kicked", {});
      return done();
    }
    case "forceMute": {
      if (!canModerate(me) || !target || target.role === "owner")
        return { ok: false, error: "forbidden" };
      if (me!.role === "mod" && target.role === "mod") return { ok: false, error: "forbidden" };
      target.muted = true;
      push(s.code, target.uid, "forceMute", {});
      return done();
    }
    case "deafen": {
      // Voice rooms: a moderator stops a member from hearing the room (or restores them).
      if (!canModerate(me) || !target || target.role === "owner")
        return { ok: false, error: "forbidden" };
      if (me!.role === "mod" && target.role === "mod") return { ok: false, error: "forbidden" };
      target.deafened = a.value !== false;
      push(s.code, target.uid, "deafenState", { value: target.deafened });
      return done();
    }
    case "setRole": {
      if (me?.role !== "owner" || !target || target.role === "owner")
        return { ok: false, error: "forbidden" };
      target.role = a.role === "mod" ? "mod" : "member";
      return done();
    }
    case "setPublic": {
      if (me?.role !== "owner") return { ok: false, error: "forbidden" };
      s.isPublic = !!a.isPublic;
      return done();
    }
    case "close": {
      if (me?.role !== "owner") return { ok: false, error: "forbidden" };
      hub.listeners.get(s.code)?.forEach((_set, u) => push(s.code, u, "closed", {}));
      hub.spaces.delete(s.code);
      return {
        ok: true,
        view: {
          ...summary(s),
          status: "none",
          members: [],
          pending: [],
          messages: [],
          captions: [],
        },
      };
    }
    case "update": {
      if (!me) return { ok: false, error: "forbidden" };
      if (a.avatar) me.avatar = clean(a.avatar, 30);
      if (a.side) me.side = side;
      if (typeof a.muted === "boolean") me.muted = a.muted;
      return done();
    }
    case "message": {
      const text = clean(a.text, 1000);
      if (!me || !text) return { ok: false, error: "forbidden" };
      s.messages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        uid,
        name: me.name,
        text,
        at: Date.now(),
      });
      if (s.messages.length > 500) s.messages.splice(0, s.messages.length - 500);
      return done();
    }
    case "caption": {
      // Live-translation line from a member of a voice room, relayed to everyone.
      if (!me || s.kind !== "voice") return { ok: false, error: "forbidden" };
      const text = clean(a.text, 300);
      if (!text) return { ok: false, error: "forbidden" };
      const caption: Caption = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        uid,
        name: me.name,
        lang: clean(a.lang, 12) || "unknown",
        text,
        tt: clean(a.tt, 300) || undefined,
        tlang: clean(a.tlang, 12) || undefined,
        at: Date.now(),
      };
      s.captions.push(caption);
      if (s.captions.length > 30) s.captions.splice(0, s.captions.length - 30);
      return done();
    }
    case "signal": {
      // WebRTC offer/answer/ICE relay between two members of the same voice room.
      if (!me || !a.to || !s.members.has(a.to)) return { ok: false, error: "forbidden" };
      push(s.code, a.to, "signal", { from: uid, payload: a.payload });
      return { ok: true, view: viewFor(s, uid) };
    }
    default:
      return { ok: false, error: "bad_action" };
  }
}

/* ---------- live connections (SSE) ---------- */
export function addListener(codeRaw: string, uid: string, send: Send): (() => void) | null {
  const code = normalizeCode(codeRaw);
  const s = hub.spaces.get(code);
  if (!s) return null;
  let byUid = hub.listeners.get(code);
  if (!byUid) hub.listeners.set(code, (byUid = new Map()));
  let set = byUid.get(uid);
  if (!set) byUid.set(uid, (set = new Set()));
  set.add(send);
  const timerKey = `${code}:${uid}`;
  const t = hub.graceTimers.get(timerKey);
  if (t) {
    clearTimeout(t);
    hub.graceTimers.delete(timerKey);
  }
  send("state", viewFor(s, uid));

  return () => {
    set.delete(send);
    if (set.size > 0) return;
    byUid.delete(uid);
    // Voice rooms: a dropped connection (closed tab) removes the person after a short grace period.
    if (s.kind === "voice") {
      hub.graceTimers.set(
        timerKey,
        setTimeout(() => {
          hub.graceTimers.delete(timerKey);
          if (hub.listeners.get(code)?.has(uid)) return;
          if (s.members.delete(uid) || s.pending.delete(uid)) {
            if (s.members.size === 0) hub.spaces.delete(code);
            else broadcast(s);
          }
        }, 8000),
      );
    }
  };
}
