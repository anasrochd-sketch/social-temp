"use client";

import { useState } from "react";
import { Check, Copy, Crown, MicOff, QrCode, ShieldCheck, UserX } from "lucide-react";
import { QrImage } from "@/components/common/QrImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useS } from "@/i18n/spaces";
import { roomPath, type SpaceView } from "@/lib/spaces-client";

type Send = (body: Record<string, unknown>) => Promise<unknown>;

/** Share box + participants + join requests + owner/moderator controls. Used by voice rooms and group chats. */
export function SpacePanel({ view, meUid, send }: { view: SpaceView; meUid: string; send: Send }) {
  const t = useS();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [showQr, setShowQr] = useState(false);
  const isOwner = view.status === "owner";
  const canMod = isOwner || view.status === "mod";

  const shareLink = `${window.location.origin}${roomPath(view.kind, view.code)}`;

  const copy = async (what: "link" | "code") => {
    const text = what === "code" ? view.code : shareLink;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-cova-mute">{t("room.code")}</p>
              <p className="font-mono text-xl font-semibold tracking-widest">{view.code}</p>
            </div>
            <Badge tone={view.isPublic ? "pale" : "soft"}>
              {view.isPublic ? t("lobby.public") : t("lobby.private")}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void copy("link")}>
              {copied === "link" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied === "link" ? t("room.copied") : t("room.copyLink")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void copy("code")}>
              {copied === "code" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied === "code" ? t("room.copied") : t("room.copyCode")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowQr((v) => !v)}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {showQr ? t("room.hideQr") : t("room.showQr")}
            </Button>
          </div>
          {showQr && (
            <div className="flex justify-center rounded-lg border border-cova-line bg-white p-3">
              <QrImage value={shareLink} size={200} />
            </div>
          )}
          {isOwner && (
            <div className="flex flex-wrap gap-2 border-t border-cova-line pt-3">
              <Button
                size="sm"
                variant="ghost"
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

      {canMod && view.pending.length > 0 && (
        <Card className="border-cova-muted">
          <CardBody>
            <h3 className="mb-3 text-sm font-semibold">
              {t("room.requests")} ({view.pending.length})
            </h3>
            <ul className="space-y-2">
              {view.pending.map((p) => (
                <li key={p.uid} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <span className="flex shrink-0 gap-1.5">
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
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h3 className="mb-3 text-sm font-semibold">
            {t("room.participants")} ({view.members.length})
          </h3>
          <ul className="space-y-2.5">
            {view.members.map((m) => {
              const isMe = m.uid === meUid;
              const canActOn =
                canMod &&
                !isMe &&
                m.role !== "owner" &&
                !(view.status === "mod" && m.role === "mod");
              return (
                <li key={m.uid} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="truncate font-medium">
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
                    {m.muted && view.kind === "voice" && (
                      <MicOff className="h-3.5 w-3.5 shrink-0 text-cova-mute" aria-hidden="true" />
                    )}
                  </span>
                  {canActOn && (
                    <span className="flex shrink-0 gap-1">
                      {isOwner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void send({
                              type: "setRole",
                              target: m.uid,
                              role: m.role === "mod" ? "member" : "mod",
                            })
                          }
                        >
                          {m.role === "mod" ? t("room.removeMod") : t("room.makeMod")}
                        </Button>
                      )}
                      {view.kind === "voice" && !m.muted && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void send({ type: "forceMute", target: m.uid })}
                          aria-label={t("room.muteThem")}
                        >
                          <MicOff className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void send({ type: "kick", target: m.uid })}
                        aria-label={t("room.remove")}
                      >
                        <UserX className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
