/**
 * UI / demo types used by the frontend today.
 * The planned database-shaped entities live in ./models.ts.
 */

export type Tone = "pale" | "soft" | "muted";

export interface Student {
  id: string;
  name: string;
  headline: string;
  school: string;
  major: string;
  location: string;
  bio: string;
  skills: string[];
  interests: string[];
  xp: number;
  badges: string[];
  joined: string;
  tone: Tone;
}

export type GroupCategory = "Study" | "Project" | "Coding" | "Design" | "Languages";

export interface GroupActivity {
  id: string;
  author: string;
  text: string;
  time: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  category: GroupCategory;
  memberIds: string[];
  tags: string[];
  isPrivate: boolean;
  nextSession?: string;
  ownerId: string;
  activity: GroupActivity[];
}

export type LessonType = "video" | "reading" | "exercise";

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  type: LessonType;
  summary: string;
  content?: string;
}

export type CourseLevel = "Beginner" | "Intermediate" | "Advanced";

export interface Course {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  category: string;
  instructor: string;
  tags: string[];
  learners: number;
  lessons: Lesson[];
}

export type AssignmentStatus = "todo" | "in-progress" | "submitted" | "graded";

export interface Assignment {
  id: string;
  title: string;
  courseId: string;
  description: string;
  /** ISO date (YYYY-MM-DD) */
  due: string;
  points: number;
  status: AssignmentStatus;
  grade?: number;
}

export type Difficulty = "Easy" | "Medium" | "Hard";
export type ChallengeKind = "Daily" | "Weekly" | "Coding" | "Community";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  kind: ChallengeKind;
  difficulty: Difficulty;
  points: number;
  minutes: number;
}

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  participantId: string;
  unread: number;
  messages: ChatMessage[];
}

export type NotificationKind = "assignment" | "group" | "challenge" | "message" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  href?: string;
}

export interface UserSettings {
  displayName: string;
  email: string;
  bio: string;
  emailNotifications: boolean;
  messageAlerts: boolean;
  weeklyDigest: boolean;
  profileVisibility: "everyone" | "groups" | "private";
}

export interface DemoSession {
  name: string;
  email: string;
}
