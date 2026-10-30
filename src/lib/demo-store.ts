import { useSyncExternalStore } from "react";
import type { AssignmentStatus, ChatMessage, DemoSession, UserSettings } from "@/types";
/**
 * Lightweight DEMO persistence. State lives in this browser's localStorage only.
 * It is NOT a database, there is no sync between devices or users, and it will be
 * replaced by real API calls once the backend exists.
 */

const STORAGE_KEY = "cova-demo-state-v1";

export interface DemoState {
  session: DemoSession | null;
  joinedGroups: string[];
  completedChallenges: string[];
  enrolledCourses: string[];
  completedLessons: string[];
  assignments: Record<string, { status: AssignmentStatus; submission?: string }>;
  readNotifications: string[];
  /** Messages sent in this browser, keyed by the other student's id. */
  chats: Record<string, ChatMessage[]>;
  readChats: string[];
  bookmarks: string[];
  connections: string[];
  /** Activity that earns leaderboard XP (kept per browser until the backend exists). */
  voiceMinutes: number;
  hostedSpaces: number;
  groupMessages: number;
  settings: UserSettings;
}

export const DEFAULT_STATE: DemoState = {
  session: null,
  joinedGroups: ["algorithms-circle"],
  completedChallenges: [],
  enrolledCourses: ["intro-python", "web-foundations"],
  completedLessons: ["intro-python-l1", "intro-python-l2", "web-foundations-l1"],
  assignments: {},
  readNotifications: [],
  chats: {},
  readChats: [],
  bookmarks: [],
  connections: ["amara-okafor"],
  voiceMinutes: 0,
  hostedSpaces: 0,
  groupMessages: 0,
  settings: {
    displayName: "Sam Rivera",
    email: "sam.rivera@example.edu",
    bio: "Curious student learning in public.",
    emailNotifications: true,
    messageAlerts: true,
    weeklyDigest: false,
    profileVisibility: "everyone",
  },
};

let state: DemoState = DEFAULT_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoState>;
      state = {
        ...DEFAULT_STATE,
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
      };
    }
  } catch {
    state = DEFAULT_STATE;
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage can be unavailable (private mode, quota). The demo keeps working in memory. */
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DemoState {
  load();
  return state;
}

function getServerSnapshot(): DemoState {
  return DEFAULT_STATE;
}

function update(fn: (s: DemoState) => DemoState): void {
  load();
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const demoActions = {
  signIn(session: DemoSession) {
    update((s) => ({
      ...s,
      session,
      settings: { ...s.settings, displayName: session.name, email: session.email },
    }));
  },
  signOut() {
    update((s) => ({ ...s, session: null }));
  },
  toggleGroup(id: string) {
    update((s) => ({ ...s, joinedGroups: toggle(s.joinedGroups, id) }));
  },
  toggleChallenge(id: string) {
    update((s) => ({ ...s, completedChallenges: toggle(s.completedChallenges, id) }));
  },
  toggleEnrollment(id: string) {
    update((s) => ({ ...s, enrolledCourses: toggle(s.enrolledCourses, id) }));
  },
  toggleLesson(id: string) {
    update((s) => ({ ...s, completedLessons: toggle(s.completedLessons, id) }));
  },
  setAssignment(id: string, status: AssignmentStatus, submission?: string) {
    update((s) => ({ ...s, assignments: { ...s.assignments, [id]: { status, submission } } }));
  },
  markNotificationRead(id: string) {
    update((s) => ({
      ...s,
      readNotifications: s.readNotifications.includes(id)
        ? s.readNotifications
        : [...s.readNotifications, id],
    }));
  },
  markAllNotificationsRead(ids: string[]) {
    update((s) => ({
      ...s,
      readNotifications: Array.from(new Set([...s.readNotifications, ...ids])),
    }));
  },
  sendMessage(participantId: string, text: string) {
    const message: ChatMessage = { id: `local-${Date.now()}`, from: "me", text, time: "Just now" };
    update((s) => ({
      ...s,
      chats: { ...s.chats, [participantId]: [...(s.chats[participantId] ?? []), message] },
    }));
  },
  markChatRead(participantId: string) {
    update((s) =>
      s.readChats.includes(participantId)
        ? s
        : { ...s, readChats: [...s.readChats, participantId] },
    );
  },
  toggleBookmark(id: string) {
    update((s) => ({ ...s, bookmarks: toggle(s.bookmarks, id) }));
  },
  toggleConnection(id: string) {
    update((s) => ({ ...s, connections: toggle(s.connections, id) }));
  },
  addVoiceMinute() {
    update((s) => ({ ...s, voiceMinutes: s.voiceMinutes + 1 }));
  },
  addHostedSpace() {
    update((s) => ({ ...s, hostedSpaces: s.hostedSpaces + 1 }));
  },
  addGroupMessage() {
    update((s) => ({ ...s, groupMessages: s.groupMessages + 1 }));
  },
  saveSettings(settings: UserSettings) {
    update((s) => ({ ...s, settings }));
  },
  reset() {
    update(() => DEFAULT_STATE);
  },
};
