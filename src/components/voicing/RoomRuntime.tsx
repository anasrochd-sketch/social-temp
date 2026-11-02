"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MicOff, PhoneOff, Radio } from "lucide-react";
import { useVoiceMesh } from "@/components/voicing/useVoiceMesh";
import { useS } from "@/i18n/spaces";
import {
  useIdentity,
  useSpace,
  useVoiceXp,
  type Signal,
  type SpaceEnd,
  type SpaceView,
} from "@/lib/spaces-client";
import { cn } from "@/lib/utils";

/**
 * Keeps one voice-room connection alive at the app-shell level, so walking
 * between pages never drops the audio: the mic, the peer connections and the
 * live SSE stream all live here instead of inside the room page. A floating
 * pill (RoomFloatingPill) lets people jump back or hang up from anywhere.
 */

export interface JoinParams {
  name: string;
  avatar: string;
  side: "left" | "right";
}

interface RoomRuntimeValue {
  /** Room code currently held by the runtime ("" when browsing freely). */
  code: string;
  /** Identity used on the server (u-<profile id> or guest id). */
  uid: string;
  /** Display name suggested for the join form. */
  name: string;
  view: SpaceView | null;
  notFound: boolean;
  ended: SpaceEnd;
  micError: boolean;
  muted: boolean;
  inRoom: boolean;
  /** Loudness 0..1 for any member (drives the 3D avatars). */
  getLevel: (uid: string) => number;
  enter: (code: string, join?: JoinParams) => void;
  leave: () => Promise<void>;
  send: (body: Record<string, unknown>) => Promise<unknown>;
  onSignal: (fn: (s: Signal) => void) => () => void;
  onForceMute: (fn: () => void) => () => void;
  toggleMute: (value: boolean) => void;
}

const RoomRuntimeContext = createContext<RoomRuntimeValue | null>(null);

export function useRoomRuntime(): RoomRuntimeValue {
  const ctx = useContext(RoomRuntimeContext);
  if (!ctx) throw new Error("useRoomRuntime must be used inside <RoomRuntimeProvider>");
  return ctx;
}

export function RoomRuntimeProvider({ children }: { children: ReactNode }) {
  const { uid, name, ready } = useIdentity();
  const [code, setCode] = useState("");
  const space = useSpace(code, uid);
  const { view, ended } = space;

  const joinReqRef = useRef<JoinParams | null>(null);
  const joinedRef = useRef(false);

  const status = view?.status;
  const inRoom =
    code !== "" &&
    !!view &&
    (status === "owner" || status === "mod" || status === "member") &&
    !ended;

  // A "none" status means the server is waiting for the join call.
  useEffect(() => {
    if (!code || !view || joinedRef.current) return;
    if (view.status !== "none" || !joinReqRef.current) return;
    const params = joinReqRef.current;
    joinReqRef.current = null;
    joinedRef.current = true;
    void space.send({ type: "join", ...params });
  }, [code, view, space]);

  const peerUids = useMemo(
    () => (inRoom && view ? view.members.map((m) => m.uid).sort() : []),
    [inRoom, view],
  );

  const sendSignal = useCallback(
    (to: string, payload: unknown) => void space.send({ type: "signal", to, payload }),
    [space],
  );
  // The mesh owns the mute state (it flips the actual audio track).
  const { getLevel, micError, muted, setMuted } = useVoiceMesh({
    enabled: inRoom,
    meUid: uid,
    peerUids,
    sendSignal,
    onSignal: space.onSignal,
  });
  useVoiceXp(inRoom);

  const toggleMute = useCallback(
    (value: boolean) => {
      setMuted(value);
      void space.send({ type: "update", muted: value });
    },
    [space, setMuted],
  );
  useEffect(() => space.onForceMute(() => toggleMute(true)), [space, toggleMute]);

  const enter = useCallback(
    (next: string, join?: JoinParams) => {
      joinReqRef.current = join ?? null;
      joinedRef.current = false;
      setMuted(false);
      setCode(next);
    },
    [setMuted],
  );

  const leave = useCallback(async () => {
    if (code) await space.send({ type: "leave" }).catch(() => undefined);
    joinReqRef.current = null;
    joinedRef.current = false;
    setMuted(false);
    setCode("");
  }, [code, space, setMuted]);

  const value = useMemo<RoomRuntimeValue>(
    () => ({
      code,
      uid,
      name,
      view,
      notFound: space.notFound,
      ended: space.ended,
      micError,
      muted,
      inRoom,
      getLevel,
      enter,
      leave,
      send: space.send,
      onSignal: space.onSignal,
      onForceMute: space.onForceMute,
      toggleMute,
    }),
    [code, uid, name, view, space, micError, muted, inRoom, getLevel, enter, leave, toggleMute],
  );

  return (
    <RoomRuntimeContext.Provider value={value}>
      {ready ? children : null}
      <RoomFloatingPill />
    </RoomRuntimeContext.Provider>
  );
}

/** Small "you are still in a room" pill shown on every other page. */
function RoomFloatingPill() {
  const t = useS();
  const runtime = useRoomRuntime();
  const pathname = usePathname();

  const ended = runtime.ended !== null;
  const active = runtime.code !== "" && pathname !== `/voicing/${runtime.code}`;

  // Show the pill while the person is elsewhere in the app; once the room ends
  // keep a short notice (with the dismiss button) until they let go of it.
  const showPill = ended ? runtime.code !== "" : active;
  if (!showPill) return null;
  return (
    <div className="fixed bottom-4 start-4 z-40 flex items-center gap-2 rounded-full bg-cova-ink py-2 pe-2 ps-4 text-sm text-white shadow-xl">
      {ended ? (
        <span className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-cova-muted" aria-hidden="true" />
          {runtime.ended === "kicked" ? t("room.kicked") : t("room.closed")}
        </span>
      ) : (
        <>
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="max-w-40 truncate font-medium">
            {runtime.view?.name ?? runtime.code}
          </span>
          <Link
            href={`/voicing/${runtime.code}`}
            className={cn(
              "rounded-full bg-white/15 px-3 py-1 text-xs font-medium transition hover:bg-white/25",
            )}
          >
            {t("room.backToRoom")}
          </Link>
          {runtime.muted ? (
            <MicOff className="h-4 w-4 text-cova-muted" aria-label={t("room.mutedFlag")} />
          ) : null}
        </>
      )}
      <button
        type="button"
        aria-label={t("room.leave")}
        onClick={() => void runtime.leave()}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600"
      >
        <PhoneOff className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
