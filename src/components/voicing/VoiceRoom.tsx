"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed, Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { VoiceCaptions } from "@/components/voicing/VoiceCaptions";
import { JoinGate } from "@/components/spaces/JoinGate";
import { RoomToolbar } from "@/components/spaces/RoomToolbar";
import { AvatarStage } from "@/components/voicing/AvatarStage";
import { useRoomRuntime } from "@/components/voicing/RoomRuntime";
import { useCaptionView } from "@/components/voicing/useCaptionView";
import { readSavedAvatar, readSavedSide } from "@/components/voicing/avatars";
import { useS } from "@/i18n/spaces";
import { api, type SpaceView } from "@/lib/spaces-client";

/**
 * Room page. The connection itself lives in RoomRuntimeProvider (app shell),
 * so navigating away keeps the audio running — this component only paints.
 *
 * Visiting another room's page switches straight over (leaving the previous
 * room in the background): public rooms auto-join with the saved identity,
 * private rooms show the join/request form. No "you are in another room"
 * stop-over dialog — pressing create / join lands in the room immediately.
 */
export function VoiceRoom({ code }: { code: string }) {
  const t = useS();
  const router = useRouter();
  const runtime = useRoomRuntime();
  const { view, notFound, ended } = runtime;
  const [captionsOpen, setCaptionsOpen] = useState(true);
  const [missing, setMissing] = useState(false);

  const mine = runtime.code === code;
  const inRoom = mine && runtime.inRoom;
  const uid = runtime.uid;

  const switchRef = useRef<string | null>(null);
  const autoJoinRef = useRef<string | null>(null);

  useEffect(() => {
    if (missing) return;
    if (runtime.code !== code) {
      // Another room (or nothing) is held — switch over, once per code.
      if (switchRef.current === code) return;
      switchRef.current = code;
      void (async () => {
        // Check the target room exists; private rooms go through the form.
        const r = await api<{ space?: SpaceView }>(
          `/api/spaces/${code}?uid=${encodeURIComponent(runtime.uid)}`,
        ).catch(() => null);
        if (!r?.ok || !r.data.space) {
          setMissing(true);
          return;
        }
        const pub = !!r.data.space.isPublic;
        const prefs = {
          name: runtime.name || "Guest",
          avatar: readSavedAvatar(),
          side: readSavedSide(),
        };
        if (runtime.code) await runtime.leave().catch(() => undefined);
        if (pub) autoJoinRef.current = code;
        runtime.enter(code, pub ? prefs : undefined);
      })();
      return;
    }
    // Already on this room: public rooms join themselves with saved prefs.
    if (!ended && view && view.isPublic && view.status === "none" && autoJoinRef.current !== code) {
      autoJoinRef.current = code;
      runtime.enter(code, {
        name: runtime.name || "Guest",
        avatar: readSavedAvatar(),
        side: readSavedSide(),
      });
    }
  }, [code, view, ended, missing, runtime]);

  // Speech bubbles under the characters, in the viewer's chosen language.
  const bubbles = useCaptionView(inRoom && view ? view.captions : [], uid);

  const leave = async () => {
    await runtime.leave();
    router.push("/voicing");
  };

  if (missing) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("room.notFound")}
        description={code}
        action={
          <Button
            onClick={() => {
              setMissing(false);
              router.push("/voicing");
            }}
          >
            {t("room.back")}
          </Button>
        }
      />
    );
  }

  if (mine && (notFound || (!view && ended === "closed"))) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("room.notFound")}
        description={code}
        action={
          <Button
            onClick={() => {
              void runtime.leave();
              router.push("/voicing");
            }}
          >
            {t("room.back")}
          </Button>
        }
      />
    );
  }
  if (!mine || !view) return null;

  if (!inRoom) {
    return (
      <JoinGate
        view={view}
        ended={ended}
        defaultName={runtime.name}
        onJoin={async (p) => runtime.enter(code, p)}
        onCancel={async () => void (await runtime.send({ type: "cancel" }))}
        onBack={() => router.push("/voicing")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <RoomToolbar
        view={view}
        meUid={uid}
        send={runtime.send}
        captionsOpen={captionsOpen}
        onToggleCaptions={() => setCaptionsOpen((v) => !v)}
      />

      <div className="relative">
        <AvatarStage
          className="h-[26rem] rounded-2xl bg-gradient-to-b from-cova-ink to-[#1b2a3a] shadow-lg sm:h-[32rem]"
          meUid={uid}
          getLevel={runtime.getLevel}
          bubbles={bubbles}
          members={view.members.map((m) => ({
            uid: m.uid,
            name: m.name,
            avatar: m.avatar,
            side: m.side,
            role: m.role,
            muted: m.uid === uid ? runtime.muted : m.muted,
          }))}
        />
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
          <Button
            size="lg"
            variant={runtime.muted ? "danger" : "secondary"}
            onClick={() => runtime.toggleMute(!runtime.muted)}
            disabled={runtime.micError}
            aria-pressed={runtime.muted}
          >
            {runtime.muted ? (
              <MicOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
            {runtime.muted ? t("room.unmute") : t("room.mute")}
          </Button>
          <Button size="lg" variant="danger" onClick={() => void leave()}>
            <PhoneOff className="h-5 w-5" aria-hidden="true" />
            {t("room.leave")}
          </Button>
        </div>
      </div>

      {runtime.micError && (
        <p className="rounded-lg bg-cova-pale px-3 py-2 text-sm" role="status">
          {t("room.micOff")}
        </p>
      )}

      {captionsOpen && <VoiceCaptions captions={view.captions} meUid={uid} send={runtime.send} />}
    </div>
  );
}
