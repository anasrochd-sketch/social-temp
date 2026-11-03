"use client";

import {
  Crown,
  Ear,
  EarOff,
  MicOff,
  ShieldCheck,
  UserX,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useS } from "@/i18n/spaces";
import type { SpaceView } from "@/lib/spaces-client";

type Send = (body: Record<string, unknown>) => Promise<unknown>;

/**
 * Participants panel for voice rooms: everyone in the room with their mic /
 * hearing flags, and — for the owner and moderators — a mute, deafen and kick
 * button on every member row. Join requests are approved here too.
 */
export function ParticipantsPanel({
  view,
  meUid,
  deafened,
  send,
}: {
  view: SpaceView;
  meUid: string;
  /** Live deafen state of ME (drives the banner). */
  deafened: boolean;
  send: Send;
}) {
  const t = useS();
  const isOwner = view.status === "owner";
  const canMod = isOwner || view.status === "mod";

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {t("room.people")}
            <Badge tone="pale">{view.members.length}</Badge>
          </h3>
          <span className="font-mono text-xs tracking-widest text-cova-mute">{view.code}</span>
        </div>

        {deafened && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
            {t("room.deafenedYou")}
          </p>
        )}

        {canMod && view.pending.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5">
            <p className="mb-2 text-xs font-semibold text-amber-800">{t("room.requests")}</p>
            <ul className="space-y-2">
              {view.pending.map((p) => (
                <li key={p.uid} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" onClick={() => void send({ type: "approve", target: p.uid })}>
                      {t("room.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void send({ type: "deny", target: p.uid })}
                    >
                      {t("room.deny")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-2.5">
          {view.members.map((m) => {
            const isMe = m.uid === meUid;
            const canActOn =
              canMod && !isMe && m.role !== "owner" && !(view.status === "mod" && m.role === "mod");
            return (
              <li
                key={m.uid}
                className="flex items-center justify-between gap-2 rounded-lg bg-cova-bg px-2.5 py-2"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {m.name}
                    {isMe && <span className="text-cova-mute"> ({t("room.you")})</span>}
                  </span>
                  {m.role === "owner" && (
                    <Crown
                      className="h-4 w-4 shrink-0 text-cova-muted"
                      aria-label={t("room.owner")}
                    />
                  )}
                  {m.role === "mod" && (
                    <ShieldCheck
                      className="h-4 w-4 shrink-0 text-cova-muted"
                      aria-label={t("room.mod")}
                    />
                  )}
                  {m.muted && (
                    <MicOff className="h-3.5 w-3.5 shrink-0 text-cova-mute" aria-hidden="true" />
                  )}
                  {m.deafened && (
                    <EarOff className="h-3.5 w-3.5 shrink-0 text-cova-mute" aria-hidden="true" />
                  )}
                </span>
                {canActOn && (
                  <span className="flex shrink-0 items-center gap-1">
                    {!m.muted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void send({ type: "forceMute", target: m.uid })}
                        aria-label={t("room.muteThem")}
                        title={t("room.muteThem")}
                      >
                        <VolumeX className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    {view.kind === "voice" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void send({ type: "deafen", target: m.uid, value: !m.deafened })
                        }
                        aria-label={m.deafened ? t("room.undeafen") : t("room.deafen")}
                        title={m.deafened ? t("room.undeafen") : t("room.deafen")}
                      >
                        {m.deafened ? (
                          <Ear className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <EarOff className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void send({ type: "kick", target: m.uid })}
                      aria-label={t("room.remove")}
                      title={t("room.remove")}
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && (
          <div className="flex flex-wrap gap-2 border-t border-cova-line pt-2.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void send({ type: "setPublic", isPublic: !view.isPublic })}
            >
              {view.isPublic ? t("room.makePrivate") : t("room.makePublic")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => void send({ type: "close" })}>
              {t("room.close")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
