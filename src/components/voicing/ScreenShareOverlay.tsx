"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorUp, MousePointerClick } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useS } from "@/i18n/spaces";
import { normalizedVideoPoint } from "@/components/voicing/roomControl";
import type { RoomVoiceCtl, RoomVoiceCtlActions } from "@/components/voicing/useVoiceMesh";
import { cn } from "@/lib/utils";

/**
 * Screen-share strip for voice rooms: shows the live shared screen, the
 * remote-control handshake (verification code on the host, code field on the
 * viewer) and, while controlling, captures pointer/keyboard events on the
 * video and forwards them as normalized coordinates.
 */
export function ScreenShareOverlay({
  members,
  remoteVideos,
  myScreen,
  sharing,
  ctl,
  ctlActions,
}: {
  /** uid -> name, for badges. */
  members: Record<string, string>;
  remoteVideos: Record<string, MediaStream>;
  /** My own screen while I share (local preview). */
  myScreen: MediaStream | null;
  /** I am sharing right now. */
  sharing: boolean;
  ctl: RoomVoiceCtl;
  ctlActions: RoomVoiceCtlActions;
}) {
  const t = useS();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const lastMoveRef = useRef(0);

  const sharerUids = Object.keys(remoteVideos);
  const first = sharerUids[0] ?? null;
  /** Remote share if one exists, otherwise my own while I share. */
  const stream = first ? remoteVideos[first] : sharing ? myScreen : null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (!ctl.notice) return;
    const id = window.setTimeout(() => ctlActions.clearNotice(), 4000);
    return () => window.clearTimeout(id);
  }, [ctl.notice, ctlActions]);

  if (!first && !sharing && !ctl.notice) return null;

  const controlling = first !== null && ctl.controlling === first;
  /** Null-safe: notices can render with no active sharer at all. */
  const nameOf = (uid: string | null) => (uid ? members[uid] ?? uid.slice(0, 8) : "?");

  // Viewer-side capture: gestures on the video become control messages.
  const captureProps = controlling
    ? {
        tabIndex: 0,
        onPointerMove: (e: React.PointerEvent) => {
          const el = videoRef.current;
          if (!el) return;
          const now = Date.now();
          if (now - lastMoveRef.current < 33) return; // ~30 events/s
          lastMoveRef.current = now;
          const p = normalizedVideoPoint(el, e.clientX, e.clientY);
          ctlActions.pointer(p.x, p.y);
        },
        onPointerDown: (e: React.PointerEvent) => {
          const el = videoRef.current;
          if (!el) return;
          const p = normalizedVideoPoint(el, e.clientX, e.clientY);
          ctlActions.down(p.x, p.y);
        },
        onPointerUp: (e: React.PointerEvent) => {
          const el = videoRef.current;
          if (!el) return;
          const p = normalizedVideoPoint(el, e.clientX, e.clientY);
          ctlActions.up(p.x, p.y);
        },
        onWheel: (e: React.WheelEvent) => {
          const el = videoRef.current;
          if (!el) return;
          const p = normalizedVideoPoint(el, e.clientX, e.clientY);
          ctlActions.wheel(p.x, p.y, e.deltaX, e.deltaY);
        },
        onKeyDown: (e: React.KeyboardEvent) => ctlActions.key("kd", e.key),
        onKeyUp: (e: React.KeyboardEvent) => ctlActions.key("ku", e.key),
      }
    : {};

  return (
    <Card>
      <CardBody className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MonitorUp className="h-4 w-4" aria-hidden="true" />
            {sharing
              ? t("room.sharingYou")
              : first
                ? t("room.sharingBy", { name: nameOf(first) })
                : t("room.share")}
          </h3>
          {sharing && ctl.allowed && (
            <Badge tone="soft">
              {t("room.ctlCode")}: <span className="font-mono">{ctl.code}</span>
            </Badge>
          )}
          {sharing && ctl.controlledBy && (
            <Badge tone="soft">{t("room.ctlBy", { name: nameOf(ctl.controlledBy) })}</Badge>
          )}
          <span className="ms-auto flex items-center gap-1.5">
            {sharing && !ctl.allowed && !ctl.controlledBy && (
              <Button size="sm" variant="secondary" onClick={ctlActions.enableControl}>
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                {t("room.ctlAllow")}
              </Button>
            )}
            {sharing && ctl.allowed && (
              <Button size="sm" variant="danger" onClick={ctlActions.disableControl}>
                {t("room.ctlStop")}
              </Button>
            )}
            {!sharing && first && !controlling && ctl.requested !== first && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => ctlActions.requestControl(first)}
              >
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                {t("room.ctlRequest")}
              </Button>
            )}
          </span>
        </div>

        <p className="text-[11px] text-cova-mute">
          {sharing && ctl.allowed ? t("room.ctlCodeHint") : null}
        </p>

        {ctl.notice && (
          <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs" role="status">
            {t(ctl.notice as Parameters<typeof t>[0])}
          </p>
        )}

        {!sharing && first && ctl.requested === first && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ctlActions.submitCode(codeDraft);
            }}
          >
            <label className="flex-1 text-xs font-medium text-cova-mute">
              {t("room.ctlEnter", { name: nameOf(first) })}
              <input
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                className="mt-1 h-9 w-full rounded-lg border border-cova-line bg-white px-2 font-mono text-sm tracking-widest"
                placeholder="123456"
              />
            </label>
            <Button size="sm" type="submit" className="shrink-0 self-end">
              {t("room.send")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              className="shrink-0 self-end"
              onClick={ctlActions.cancelRequest}
            >
              {t("room.cancel")}
            </Button>
          </form>
        )}

        {stream && (
          <div
            className={cn(
              "overflow-hidden rounded-xl border-2 bg-black",
              controlling ? "border-red-500" : "border-cova-line",
            )}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "aspect-video w-full object-contain outline-none",
                controlling && "cursor-none",
              )}
              {...captureProps}
            />
          </div>
        )}
        {controlling && (
          <p className="text-center text-[11px] text-cova-mute">
            {t("room.ctlActive", { name: nameOf(first) })}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
