import { challenges } from "@/data/challenges";
import { currentUser, students } from "@/data/students";
import type { DemoState } from "@/lib/demo-store";
import type { Course } from "@/types";

export const XP_PER_LEVEL = 500;
const XP_PER_LESSON = 15;
const XP_PER_VOICE_MINUTE = 1;
const XP_PER_HOSTED_SPACE = 20;
const XP_PER_GROUP_MESSAGE = 2;

export interface XpBreakdown {
  base: number;
  learning: number;
  voice: number;
  hosted: number;
  chat: number;
  total: number;
}

export function xpBreakdown(state: DemoState): XpBreakdown {
  const learning =
    computeXp({ ...state, voiceMinutes: 0, hostedSpaces: 0, groupMessages: 0 }) -
    currentUser.baseXp;
  const voice = state.voiceMinutes * XP_PER_VOICE_MINUTE;
  const hosted = state.hostedSpaces * XP_PER_HOSTED_SPACE;
  const chat = state.groupMessages * XP_PER_GROUP_MESSAGE;
  const base = currentUser.baseXp;
  return { base, learning, voice, hosted, chat, total: base + learning + voice + hosted + chat };
}

export function computeXp(state: DemoState): number {
  const challengeXp = challenges
    .filter((c) => state.completedChallenges.includes(c.id))
    .reduce((sum, c) => sum + c.points, 0);
  const lessonXp = state.completedLessons.length * XP_PER_LESSON;
  return (
    currentUser.baseXp +
    challengeXp +
    lessonXp +
    state.voiceMinutes * XP_PER_VOICE_MINUTE +
    state.hostedSpaces * XP_PER_HOSTED_SPACE +
    state.groupMessages * XP_PER_GROUP_MESSAGE
  );
}

export function levelFor(xp: number): { level: number; into: number; needed: number } {
  return {
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    into: xp % XP_PER_LEVEL,
    needed: XP_PER_LEVEL,
  };
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  isMe: boolean;
  rank: number;
}

export function buildLeaderboard(myXp: number, myName: string): LeaderboardEntry[] {
  const rows = [
    ...students.map((s) => ({ id: s.id, name: s.name, xp: s.xp, isMe: false })),
    { id: currentUser.id, name: myName, xp: myXp, isMe: true },
  ].sort((a, b) => b.xp - a.xp);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function courseProgress(
  course: Course,
  completedLessons: string[],
): { done: number; total: number; pct: number } {
  const total = course.lessons.length;
  const done = course.lessons.filter((l) => completedLessons.includes(l.id)).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

