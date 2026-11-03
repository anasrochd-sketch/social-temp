"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { useMe } from "@/lib/social-store";
import type { Member, MyStatus, SpaceKind, SpaceSummary, SpaceView } from "@/server/spaces-store";

export type { Member, MyStatus, SpaceKind, SpaceSummary, SpaceView };

const UID_KEY = "cova-uid";

/**
 * Who am I for the server. Signed-in account -> stable id derived from the email, so the
 * same account is the same person in every tab. Guests get a random per-browser id.
 * DEMO LEVEL: no real authentication yet.
 */
let guestUid = "";
function readGuestUid(): string {
  if (guestUid) return guestUid;
  try {
    let v = window.localStorage.getItem(UID_KEY);
    if (!v) {
      v = `g-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      window.localStorage.setItem(UID_KEY, v);
    }
    guestUid = v;
  } catch {
    guestUid = `g-${Math.random().toString(36).slice(2, 12)}`;
  }
  return guestUid;
}

export function useIdentity(): { uid: string; name: string; signedIn: boolean; ready: boolean } {
  const { session, settings } = useDemoState();
  const me = useMe(); // real signed-in profile from the social store (null while loading/guest)
  const guest = useSyncExternalStore(
    () => () => {},
    readGuestUid,
    () => "",
  );
  // The real account wins: same uuid in every tab, same display name as the profile.
  // Fallbacks keep guests working and cover stale demo settings saved earlier.
  const uid = me ? `u-${me.id}` : session ? `u-${session.email.toLowerCase()}` : guest;
  const name =
    me?.displayName || session?.name || settings.displayName || me?.id?.slice(0, 8) || "Guest";
  return { uid, name, signedIn: !!me || !!session, ready: !!uid };
}

export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, data };
}

export function roomPath(kind: SpaceKind, code: string): string {
  return `${kind === "voice" ? "/voicing" : "/groups"}/${code}`;
}

export interface Signal {
  from: string;
  payload: unknown;
}
export type SpaceEnd = "kicked" | "closed" | null;

/** Live connection to one space: info, my status, members, requests, chat and WebRTC signals. */
export function useSpace(code: string, uid: string) {
  const [view, setView] = useState<SpaceView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ended, setEnded] = useState<SpaceEnd>(null);
  const [live, setLive] = useState(false);
  const signalSubs = useRef(new Set<(s: Signal) => void>());
  const muteSubs = useRef(new Set<() => void>());
  const deafSubs = useRef(new Set<(value: boolean) => void>());
  const onSignal = useCallback((fn: (s: Signal) => void) => {
    signalSubs.current.add(fn);
    return () => void signalSubs.current.delete(fn);
  }, []);
  const onForceMute = useCallback((fn: () => void) => {
    muteSubs.current.add(fn);
    return () => void muteSubs.current.delete(fn);
  }, []);
  const onDeafen = useCallback((fn: (value: boolean) => void) => {
    deafSubs.current.add(fn);
    return () => void deafSubs.current.delete(fn);
  }, []);

  // Fresh room: drop any state left over from the previous one (React's
  // "adjust state when a prop changes" pattern, done during render).
  const [prevCode, setPrevCode] = useState(code);
  if (code !== prevCode) {
    setPrevCode(code);
    setView(null);
    setNotFound(false);
    setEnded(null);
  }

  // First load (works for people who are not in the space yet).
  useEffect(() => {
    if (!uid || !code) return;
    let cancelled = false;
    void api<{ space?: SpaceView }>(`/api/spaces/${code}?uid=${encodeURIComponent(uid)}`).then(
      (r) => {
        if (cancelled) return;
        if (r.ok && r.data.space) setView(r.data.space);
        else setNotFound(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, uid]);

  // Open the live stream once we are a member or waiting for approval.
  const status = view?.status;
  const wantsLive =
    status === "owner" || status === "mod" || status === "member" || status === "pending";
  useEffect(() => {
    if (!uid || !wantsLive) return;
    const es = new EventSource(`/api/spaces/${code}/events?uid=${encodeURIComponent(uid)}`);
    es.onopen = () => setLive(true);
    es.addEventListener("state", (e) =>
      setView(JSON.parse((e as MessageEvent<string>).data) as SpaceView),
    );
    es.addEventListener("signal", (e) =>
      signalSubs.current.forEach((fn) =>
        fn(JSON.parse((e as MessageEvent<string>).data) as Signal),
      ),
    );
    es.addEventListener("forceMute", () => muteSubs.current.forEach((fn) => fn()));
    es.addEventListener("deafenState", (e) => {
      let value = true;
      try {
        value = (JSON.parse((e as MessageEvent<string>).data) as { value?: boolean }).value !== false;
      } catch {
        /* keep default */
      }
      deafSubs.current.forEach((fn) => fn(value));
    });
    es.addEventListener("kicked", () => {
      setEnded("kicked");
      es.close();
    });
    es.addEventListener("closed", () => {
      setEnded("closed");
      es.close();
    });
    return () => {
      es.close();
      setLive(false);
    };
  }, [code, uid, wantsLive]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await api<{ space?: SpaceView; error?: string }>(`/api/spaces/${code}`, {
        method: "POST",
        body: JSON.stringify({ uid, ...body }),
      });
      if (r.ok && r.data.space) setView(r.data.space);
      return r;
    },
    [code, uid],
  );

  return { view, notFound, ended, live, send, onSignal, onForceMute, onDeafen };
}

/** Awards XP for time spent in a voice room: one minute every 60 s while connected. */
export function useVoiceXp(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => demoActions.addVoiceMinute(), 60_000);
    return () => window.clearInterval(id);
  }, [active]);
}
