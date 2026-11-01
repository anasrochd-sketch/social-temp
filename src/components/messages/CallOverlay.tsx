"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Video, VideoOff, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { useMe } from "@/lib/social-store";
import { ensureCallSubscription, useCall } from "@/lib/call";
import { cn } from "@/lib/utils";

/**
 * Full-screen call UI (voice / video / screen share) rendered inside the messages page.
 * Reads everything from the call manager in src/lib/call.ts.
 */

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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

  return (
    <>
      {/* Remote audio keeps playing for voice calls (no video element on screen). */}
      {kind === "audio" && <audio ref={remoteAudioRef} autoPlay />}

      {phase !== "idle" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-neutral-950/95 p-6 text-white">
          {kind === "video" && phase !== "ringing-in" && phase !== "ringing-out" ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full bg-black object-cover"
              />
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
