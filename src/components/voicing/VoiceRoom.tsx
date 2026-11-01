"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { VoiceCaptions } from "@/components/voicing/VoiceCaptions";
import { JoinGate } from "@/components/spaces/JoinGate";
import { SpacePanel } from "@/components/spaces/SpacePanel";
import { AvatarStage } from "@/components/voicing/AvatarStage";
import { useVoiceMesh } from "@/components/voicing/useVoiceMesh";
import { useS } from "@/i18n/spaces";
import { useIdentity, useSpace, useVoiceXp } from "@/lib/spaces-client";
import { DoorClosed } from "lucide-react";

export function VoiceRoom({ code }: { code: string }) {
  const t = useS();
  const router = useRouter();
  const { uid, name, ready } = useIdentity();
  const { view, notFound, ended, send, onSignal, onForceMute } = useSpace(code, uid);

  const inRoom =
    !!view &&
    (view.status === "owner" || view.status === "mod" || view.status === "member") &&
    !ended;
  const peerUids = useMemo(
    () => (inRoom ? view.members.map((m) => m.uid).sort() : []),
    [inRoom, view],
  );

  const sendSignal = useCallback(
    (to: string, payload: unknown) => void send({ type: "signal", to, payload }),
    [send],
  );
  const { getLevel, micError, muted, setMuted } = useVoiceMesh({
    enabled: inRoom,
    meUid: uid,
    peerUids,
    sendSignal,
    onSignal,
  });
  useVoiceXp(inRoom);

  const toggleMute = useCallback(
    (value: boolean) => {
      setMuted(value);
      void send({ type: "update", muted: value });
    },
    [send, setMuted],
  );
  useEffect(() => onForceMute(() => toggleMute(true)), [onForceMute, toggleMute]);

  const leave = async () => {
    await send({ type: "leave" });
    router.push("/voicing");
  };

  if (!ready) return null;
  if (notFound || (!view && ended === "closed")) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("room.notFound")}
        description={code}
        action={<Button onClick={() => router.push("/voicing")}>{t("room.back")}</Button>}
      />
    );
  }
  if (!view) return null;

  if (!inRoom) {
    return (
      <JoinGate
        view={view}
        ended={ended}
        defaultName={name}
        onBack={() => router.push("/voicing")}
        onCancel={async () => void (await send({ type: "cancel" }))}
        onJoin={async (p) => void (await send({ type: "join", ...p }))}
      />
    );
  }

  const me = view.members.find((m) => m.uid === uid);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{view.name}</h1>
            {view.description && (
              <p className="truncate text-sm text-cova-mute">{view.description}</p>
            )}
          </div>
        </div>
        <div className="relative">
          <AvatarStage
            className="h-[28rem] rounded-2xl bg-gradient-to-b from-cova-ink to-[#1b2a3a] shadow-lg sm:h-[34rem]"
            meUid={uid}
            getLevel={getLevel}
            members={view.members.map((m) => ({
              uid: m.uid,
              name: m.name,
              avatar: m.avatar,
              side: m.side,
              role: m.role,
              muted: m.uid === uid ? muted : m.muted,
            }))}
          />
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={muted ? "danger" : "secondary"}
              onClick={() => toggleMute(!muted)}
              disabled={micError}
              aria-pressed={muted}
            >
              {muted ? (
                <MicOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )}
              {muted ? t("room.unmute") : t("room.mute")}
            </Button>
            <Button size="lg" variant="danger" onClick={() => void leave()}>
              <PhoneOff className="h-5 w-5" aria-hidden="true" />
              {t("room.leave")}
            </Button>
          </div>
        </div>
        {micError && (
          <p className="mt-3 rounded-lg bg-cova-pale px-3 py-2 text-sm" role="status">
            {t("room.micOff")}
          </p>
        )}
        {me && <span className="sr-only">{me.name}</span>}
      </div>
      <div className="space-y-3">
        <SpacePanel view={view} meUid={uid} send={send} />
        <VoiceCaptions captions={view.captions} meUid={uid} send={send} />
      </div>
    </div>
  );
}
