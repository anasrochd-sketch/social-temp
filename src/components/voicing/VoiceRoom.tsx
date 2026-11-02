"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed, Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { VoiceCaptions } from "@/components/voicing/VoiceCaptions";
import { JoinGate } from "@/components/spaces/JoinGate";
import { RoomToolbar } from "@/components/spaces/RoomToolbar";
import { AvatarStage } from "@/components/voicing/AvatarStage";
import { useRoomRuntime } from "@/components/voicing/RoomRuntime";
import { useS } from "@/i18n/spaces";

/**
 * Room page. The connection itself lives in RoomRuntimeProvider (app shell),
 * so navigating away keeps the audio running — this component only paints.
 */
export function VoiceRoom({ code }: { code: string }) {
  const t = useS();
  const router = useRouter();
  const runtime = useRoomRuntime();
  const { view, notFound, ended } = runtime;
  const [captionsOpen, setCaptionsOpen] = useState(true);

  const mine = runtime.code === code;
  const inRoom = mine && runtime.inRoom;
  const uid = runtime.uid;

  const leave = async () => {
    await runtime.leave();
    router.push("/voicing");
  };

  if (!mine) {
    // Another room is still connected — switching rooms means leaving it first.
    return (
      <Card className="mx-auto max-w-md">
        <CardBody className="space-y-3 py-8 text-center">
          <h2 className="text-lg font-semibold">{t("room.anotherOpen")}</h2>
          <p className="text-sm text-cova-mute">{t("room.anotherHint")}</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => router.push(`/voicing/${runtime.code}`)}>
              {t("room.backToRoom")}
            </Button>
            <Button
              onClick={() => {
                // Leave in the background; the JoinGate shows right after.
                void runtime.leave().then(() => runtime.enter(code));
              }}
            >
              {t("room.switchRoom")}
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (notFound || (!view && ended === "closed")) {
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
  if (!view) return null;

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
          className="h-[30rem] rounded-2xl bg-gradient-to-b from-cova-ink to-[#1b2a3a] shadow-lg sm:h-[36rem]"
          meUid={uid}
          getLevel={runtime.getLevel}
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
