import type { Tone } from "@/types";

/**
 * Types for the Connect section: people, friendships, private messages and communities.
 * They mirror the Supabase tables (supabase/migrations). Every `*Id` field here is the PUBLIC id
 * of a person (COVA-XXXXXX) so the UI never sees auth user ids; src/lib/social-store.ts maps
 * between the two.
 */

export interface SocialUser {
  /** Public, unique ID. People can be found by it (for example "COVA-7K3Q9X"). */
  id: string;
  /** Only filled in for the signed-in person. Other people's emails are never loaded. */
  email: string;
  displayName: string;
  headline: string;
  tone: Tone;
  createdAt: number;
  /** True for the seeded sample students. They never answer messages. */
  sample: boolean;
}

export type FriendshipStatus = "pending" | "accepted";

export interface Friendship {
  /** Always the sorted pair of user IDs joined with "|". */
  id: string;
  /** Who sent the request. */
  fromId: string;
  toId: string;
  status: FriendshipStatus;
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  /** Sorted pair of user IDs joined with "|". */
  threadId: string;
  fromId: string;
  text: string;
  at: number;
}

export type CommunityVisibility = "public" | "private";
/** Who may publish posts: every member, owner and admins, or the owner alone. */
export type PostingPolicy = "everyone" | "admins" | "owner";
export type CommunityRole = "owner" | "admin" | "member";

export interface Community {
  id: string;
  name: string;
  description: string;
  category: string;
  visibility: CommunityVisibility;
  postingPolicy: PostingPolicy;
  hideMembers: boolean;
  /**
   * Invite code. Private communities are joined by code or link, then approved by an admin.
   * Only the owner and admins receive it; everyone else sees "".
   */
  joinCode: string;
  ownerId: string;
  createdAt: number;
}

export interface CommunityMember {
  communityId: string;
  userId: string;
  role: CommunityRole;
  joinedAt: number;
}

export interface JoinRequest {
  id: string;
  communityId: string;
  userId: string;
  createdAt: number;
}

export interface CommunityPost {
  id: string;
  communityId: string;
  authorId: string;
  text: string;
  at: number;
}

export interface SocialState {
  /** Public id of the signed-in person, or null when signed out. */
  meId: string | null;
  /** False until the first load after sign-in has finished (lists are empty until then). */
  ready: boolean;
  /** People known to this browser (friends, chat partners, members, search results). */
  users: Record<string, SocialUser>;
  friendships: Record<string, Friendship>;
  messages: DirectMessage[];
  /** `${userId}:${threadId}` -> time the thread was last read by that user. */
  reads: Record<string, number>;
  communities: Record<string, Community>;
  members: CommunityMember[];
  requests: JoinRequest[];
  posts: CommunityPost[];
}

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export type JoinOutcome = "joined" | "requested" | "already-member" | "already-requested";
