"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  Crown,
  Languages,
  MicOff,
  QrCode,
  ShieldCheck,
  UserX,
  Users,
} from "lucide-react";
import { QrImage } from "@/components/common/QrImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useS } from "@/i18n/spaces";
import { roomPath, type SpaceView } from "@/lib/spaces-client";
import { cn } from "@/lib/utils";

type Send = (body: Record<string, unknown>) => Promise<unknown>;

/**
 * Compact room bar that replaces the old right-hand sidebar: share + people +
 * moderation in dropdowns, so the 3D stage gets the whole width.
 */
export function RoomToolbar({
  view,
  meUid,
  send,
  captionsOpen,
  onToggleCaptions,
}: {
  view: SpaceView;
  meUid: string;
  send: Send;
  captionsOpen: boolean;
  onToggleCaptions: () => void;
}) {
  const t = useS();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [open, setOpen] = useState<"people" | "requests" | "qr" | "owner" | null>(null);
  const isOwner = view.status === "owner";
  const canMod = isOwner || view.status === "mod";

  const shareLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${roomPath(view.kind, view.code)}`;

  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? view.code : shareLink);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const toggle = (what: "people" | "requests" | "qr" | "owner") =>
    setOpen((cur) => (cur === what ? null : what));

  const btn =
    "h-9 rounded-lg border border-cova-line bg-white px-3 text-xs font-medium hover:bg-cova-bg";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="me-auto min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{view.name}</h1>
          <Badge tone={view.isPublic ? "pale" : "soft"}>
            {view.isPublic ? t("lobby.public") : t("lobby.private")}
          </Badge>
        </div>
        <p className="font-mono text-xs tracking-widest text-cova-mute">{view.code}</p>
      </div>

      <button type="button" className={btn} onClick={() => void copy("link")}>
        <span className="flex items-center gap-1.5">
          {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "link" ? t("room.copied") : t("room.copyLink")}
        </span>
      </button>
      <button type="button" className={btn} onClick={() => void copy("code")}>
        <span className="flex items-center gap-1.5">
          {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "code" ? t("room.copied") : t("room.copyCode")}
        </span>
      </button>

      <Pop
        open={open === "qr"}
        onToggle={() => toggle("qr")}
        label={t("room.qr")}
        icon={<QrCode className="h-3.5 w-3.5" />}
        btnClass={btn}
      >
        <div className="rounded-xl border border-cova-line bg-white p-3 shadow-xl">
          <QrImage value={shareLink} size={200} />
        </div>
      </Pop>

      {canMod && view.pending.length > 0 && (
        <Pop
          open={open === "requests"}
          onToggle={() => toggle("requests")}
          label={`${t("room.requests")} (${view.pending.length})`}
          icon={<span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />}
          btnClass={cn(btn, "border-amber-400 bg-amber-50")}
          align="end"
        >
          <div className="w-64 rounded-xl border border-cova-line bg-white p-3 shadow-xl">
            <p className="mb-2 text-xs font-semibold text-cova-mute">{t("room.requests")}</p>
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
        </Pop>
      )}

      <Pop
        open={open === "people"}
        onToggle={() => toggle("people")}
        label={`${t("room.participants")} (${view.members.length})`}
        icon={<Users className="h-3.5 w-3.5" />}
        btnClass={btn}
        align="end"
      >
        <div className="max-h-72 w-72 overflow-y-auto rounded-xl border border-cova-line bg-white p-3 shadow-xl">
          <ul className="space-y-2.5">
            {view.members.map((m) => {
              const isMe = m.uid === meUid;
              const canActOn =
                canMod &&
                !isMe &&
                m.role !== "owner" &&
                !(view.status === "mod" && m.role === "mod");
              return (
                <li key={m.uid} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
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
                    {m.muted && (
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
        </div>
      </Pop>

      {isOwner && (
        <Pop
          open={open === "owner"}
          onToggle={() => toggle("owner")}
          label={t("room.options")}
          icon={<Crown className="h-3.5 w-3.5" />}
          btnClass={btn}
          align="end"
        >
          <div className="flex w-52 flex-col gap-2 rounded-xl border border-cova-line bg-white p-3 shadow-xl">
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
        </Pop>
      )}

      <button
        type="button"
        onClick={onToggleCaptions}
        aria-pressed={captionsOpen}
        className={cn(btn, captionsOpen && "border-cova-ink bg-cova-pale")}
      >
        <span className="flex items-center gap-1.5">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          {t("cap.title")}
        </span>
      </button>
    </div>
  );
}

/** Minimal dropdown with a click-away backdrop. */
function Pop({
  open,
  onToggle,
  label,
  icon,
  btnClass,
  align = "start",
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  icon: ReactNode;
  btnClass?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} className={btnClass}>
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={onToggle}
            aria-hidden="true"
          />
          <div
            className={cn(
              "absolute top-full z-50 mt-2 block",
              align === "end" ? "end-0" : "start-0",
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
