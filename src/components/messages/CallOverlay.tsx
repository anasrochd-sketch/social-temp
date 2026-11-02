"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Mic,
  MicOff,
  MonitorUp,
  MousePointerClick,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { useMe } from "@/lib/social-store";
import { controlSenders, ensureCallSubscription, useCall } from "@/lib/call";
import { cn } from "@/lib/utils";

/**
 * Full-screen call UI (voice / video / screen share / remote control) rendered
 * on top of every page. Reads everything from the call manager in src/lib/call.ts.
 */

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Maps a pointer event on the letterboxed video to 0..1 screen coordinates. */
function normalized(el: HTMLVideoElement, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect();
  const vw = el.videoWidth || 16;
  const vh = el.videoHeight || 9;
  const scale = Math.min(rect.width / vw, rect.height / vh); // object-contain
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (rect.width - dispW) / 2;
  const offY = (rect.height - dispH) / 2;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: clamp01((clientX - rect.left - offX) / dispW),
    y: clamp01((clientY - rect.top - offY) / dispH),
  };
}

export function CallOverlay() {
  const t = useT();
  const me = useMe();
  const { call, actions } = useCall();
  const { phase, kind, peer, notice } = call;

  // Listen for incoming calls on every page while someone is signed in.
  useEffect(() => {
    if (me?.id) void ensureCallSubscription();
  }, [me?.id]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const lastMoveRef = useRef(0);

  // Duration timer ticks only while the call is connected (first second shows 00:00).
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (phase !== "connected") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // End-of-call notices (declined, no answer…) stay a few seconds as a small card.
  useEffect(() => {
    if (phase === "idle" && notice) {
      const timer = setTimeout(() => actions.clearNotice(), 4000);
      return () => clearTimeout(timer);
    }
  }, [phase, notice, actions]);

  // Attach the WebRTC streams to their media elements.
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = call.localStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = call.remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.localStream, call.remoteStream]);

  // Focus the control surface as soon as control is granted.
  const ctlWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (call.controlling) ctlWrapRef.current?.focus();
  }, [call.controlling]);

  const visible = phase !== "idle" || Boolean(notice);
  const duration = useMemo(
    () => (call.connectedAt ? formatDuration(now - call.connectedAt) : ""),
    [call.connectedAt, now],
  );

  if (!visible) return null;

  const status =
    phase === "ringing-in"
      ? kind === "video"
        ? t("call.incomingVideo")
        : t("call.incoming")
      : phase === "ringing-out"
        ? t("call.outgoing")
        : phase === "connecting"
          ? t("call.connecting")
          : phase === "connected"
            ? duration
            : "";

  const controlButton = cn(
    "flex h-12 w-12 items-center justify-center rounded-full transition",
    "bg-white/10 text-white hover:bg-white/20",
  );

  /* ---- viewer side: turn remote-video gestures into control messages ---- */
  const surfaceHandlers = call.controlling
    ? {
        onPointerMove: (e: React.PointerEvent) => {
          const el = remoteVideoRef.current;
          if (!el) return;
          const ts = Date.now();
          if (ts - lastMoveRef.current < 60) return; // throttle
          lastMoveRef.current = ts;
          const { x, y } = normalized(el, e.clientX, e.clientY);
          controlSenders.pointer(x, y);
        },
        onPointerDown: (e: React.PointerEvent) => {
          e.preventDefault();
          const el = remoteVideoRef.current;
          if (!el) return;
          const { x, y } = normalized(el, e.clientX, e.clientY);
          controlSenders.down(x, y);
        },
        onPointerUp: (e: React.PointerEvent) => {
          e.preventDefault();
          const el = remoteVideoRef.current;
          if (!el) return;
          const { x, y } = normalized(el, e.clientX, e.clientY);
          controlSenders.up(x, y);
        },
        onWheel: (e: React.WheelEvent) => {
          e.preventDefault();
          const el = remoteVideoRef.current;
          if (!el) return;
          const { x, y } = normalized(el, e.clientX, e.clientY);
          controlSenders.wheel(x, y, e.deltaX, e.deltaY);
        },
        onKeyDown: (e: React.KeyboardEvent) => controlSenders.key("kd", e.key),
        onKeyUp: (e: React.KeyboardEvent) => controlSenders.key("ku", e.key),
      }
    : {};

  return (
    <>
      {/* Remote audio keeps playing for voice calls (no video element on screen). */}
      {kind === "audio" && <audio ref={remoteAudioRef} autoPlay />}

      {phase !== "idle" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-neutral-950/95 p-6 text-white">
          {kind === "video" && phase !== "ringing-in" && phase !== "ringing-out" ? (
            <>
              {/* While controlling: contain (see the whole screen) + crosshair. */}
              <div
                ref={ctlWrapRef}
                tabIndex={call.controlling ? 0 : -1}
                className={cn(
                  "absolute inset-0 outline-none",
                  call.controlling && "cursor-crosshair ring-2 ring-inset ring-emerald-400/70",
                )}
                {...surfaceHandlers}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={cn(
                    "h-full w-full bg-black",
                    call.controlling ? "object-contain" : "object-cover",
                  )}
                />
              </div>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "absolute rounded-xl border border-white/20 object-cover shadow-lg",
                  call.sharing ? "bottom-6 end-6 h-28 w-20" : "bottom-24 end-6 h-40 w-28",
                )}
              />
              {call.sharing && (
                <span className="absolute start-6 top-6 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-medium">
                  {t("call.sharing")}
                </span>
              )}
              {call.peerSharing && !call.sharing && (
                <span className="absolute start-6 top-6 rounded-full bg-sky-500/90 px-3 py-1 text-xs font-medium">
                  {t("call.peerSharing")}
                </span>
              )}
              {/* Host: the code must be visible INSIDE the shared tab. */}
              {call.controlAllowed && call.controlCode && (
                <span className="absolute start-6 top-14 flex items-center gap-2 rounded-full bg-white px-4 py-1.5 font-mono text-lg font-bold tracking-[0.3em] text-neutral-900 shadow-xl">
                  {call.controlCode}
                </span>
              )}
              {call.controlled && (
                <span className="absolute start-6 top-14 flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-1.5 text-xs font-semibold shadow-xl">
                  <MousePointerClick className="h-4 w-4" aria-hidden="true" />
                  {t("call.ctlActive")}
                  <button
                    type="button"
                    onClick={actions.disableControl}
                    className="ms-1 rounded bg-white/20 px-2 py-0.5 text-[11px] hover:bg-white/30"
                  >
                    {t("call.ctlStop")}
                  </button>
                </span>
              )}
              {call.controlling && (
                <span className="absolute end-6 top-6 flex items-center gap-2 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-medium">
                  <MousePointerClick className="h-4 w-4" aria-hidden="true" />
                  {t("call.ctlYou")}
                </span>
              )}
            </>
          ) : (
            <div className="flex-1" />
          )}

          <div className="relative z-10 flex flex-col items-center gap-3 pt-10 text-center">
            <Avatar
              name={peer?.displayName ?? "?"}
              src={peer?.avatarUrl}
              tone={peer?.tone}
              size="lg"
            />
            <p className="text-xl font-semibold">{peer?.displayName ?? ""}</p>
            <p className="text-sm text-white/70">{status}</p>

            {/* Viewer: waiting for the code check. */}
            {call.controlRequested && !call.controlling && (
              <form
                className="mt-1 flex items-center gap-2 rounded-xl bg-white/10 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  actions.submitControlCode(codeDraft);
                }}
              >
                <Keyboard className="h-4 w-4 text-white/70" aria-hidden="true" />
                <input
                  ref={codeInputRef}
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                  placeholder="••••••"
                  aria-label={t("call.ctlEnterCode")}
                  className="h-8 w-28 rounded-lg bg-black/40 px-2 text-center font-mono text-lg tracking-[0.3em] text-white outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold hover:bg-emerald-600"
                >
                  {t("call.ctlVerify")}
                </button>
                <button
                  type="button"
                  aria-label={t("dm.cancel")}
                  onClick={() => {
                    actions.cancelControlRequest();
                    setCodeDraft("");
                  }}
                  className="rounded-full p-1 hover:bg-white/10"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            )}
            {call.controlling && <p className="text-[11px] text-white/60">{t("call.ctlHint")}</p>}
          </div>

          <div className="relative z-10 flex items-center gap-4 pb-10">
            {phase === "ringing-in" ? (
              <>
                <button
                  type="button"
                  aria-label={t("call.decline")}
                  onClick={() => void actions.declineCall()}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                >
                  <PhoneOff className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t("call.accept")}
                  onClick={() => void actions.acceptCall()}
                  className="flex h-14 w-14 animate-bounce items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  <Phone className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={call.micOn ? t("call.mute") : t("call.unmute")}
                  onClick={actions.toggleMic}
                  className={cn(controlButton, !call.micOn && "bg-white text-neutral-900")}
                >
                  {call.micOn ? (
                    <Mic className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <MicOff className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>

                {kind === "video" && (
                  <>
                    <button
                      type="button"
                      aria-label={call.cameraOn ? t("call.cameraOff") : t("call.cameraOn")}
                      onClick={actions.toggleCamera}
                      className={cn(controlButton, !call.cameraOn && "bg-white text-neutral-900")}
                    >
                      {call.cameraOn ? (
                        <Video className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <VideoOff className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={call.sharing ? t("call.stopShare") : t("call.shareScreen")}
                      onClick={() => void actions.toggleShare()}
                      className={cn(
                        controlButton,
                        call.sharing && "bg-emerald-500 text-white hover:bg-emerald-600",
                      )}
                    >
                      <MonitorUp className="h-5 w-5" aria-hidden="true" />
                    </button>
                    {/* Host: allow the peer to control this page while sharing. */}
                    {call.sharing && (
                      <button
                        type="button"
                        aria-label={
                          call.controlAllowed ? t("call.ctlDisallow") : t("call.ctlAllow")
                        }
                        onClick={() =>
                          call.controlAllowed ? actions.disableControl() : actions.enableControl()
                        }
                        className={cn(
                          controlButton,
                          call.controlAllowed && "bg-emerald-500 text-white hover:bg-emerald-600",
                        )}
                      >
                        <MousePointerClick className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                    {/* Viewer: ask to control the shared screen. */}
                    {call.peerSharing &&
                      !call.sharing &&
                      !call.controlling &&
                      !call.controlRequested && (
                        <button
                          type="button"
                          aria-label={t("call.ctlRequest")}
                          onClick={() => actions.requestControl()}
                          className={controlButton}
                        >
                          <MousePointerClick className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                  </>
                )}

                <button
                  type="button"
                  aria-label={t("call.end")}
                  onClick={() => void actions.hangUp()}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                >
                  <PhoneOff className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Call ended / declined notice. */}
      {phase === "idle" && notice && (
        <div className="fixed bottom-6 start-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white shadow-xl rtl:translate-x-1/2">
          <span>{t(notice as MessageKey)}</span>
          <button
            type="button"
            aria-label={t("dm.cancel")}
            onClick={actions.clearNotice}
            className="rounded-full p-0.5 hover:bg-white/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
