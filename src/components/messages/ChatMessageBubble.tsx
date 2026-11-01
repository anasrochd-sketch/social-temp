"use client";

import { useState } from "react";
import { FileText, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DirectMessage, PostAttachment } from "@/types/social";

/**
 * One chat bubble in a direct conversation, WhatsApp-style: attachments first
 * (photo / voice note / video / file), caption text under them.
 */

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function AttachmentView({
  attachment,
  onGone,
}: {
  attachment: PostAttachment;
  onGone: (url: string) => void;
}) {
  const { url, kind, name, mime, size } = attachment;

  if (kind === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          loading="lazy"
          onError={() => onGone(url)}
          className="max-h-72 max-w-full rounded-xl border border-cova-line object-cover"
        />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => onGone(url)}
        className="max-h-72 max-w-full rounded-xl border border-cova-line"
      />
    );
  }

  if (kind === "audio") {
    return (
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cova-muted">
          <Play className="h-4 w-4 text-cova-ink" aria-hidden="true" />
        </span>
        <audio
          src={url}
          controls
          preload="metadata"
          onError={() => onGone(url)}
          className="h-9 max-w-[14rem]"
        />
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className="flex items-center gap-2 rounded-xl border border-cova-line bg-white/70 px-3 py-2 hover:bg-cova-pale"
    >
      <FileText className="h-5 w-5 shrink-0 text-cova-mute" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block max-w-[12rem] truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-cova-mute">
          {formatBytes(size)} · {mime || "file"}
        </span>
      </span>
    </a>
  );
}

export function ChatMessageBubble({
  message,
  mine,
  time,
}: {
  message: DirectMessage;
  mine: boolean;
  time: string;
}) {
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const visible = message.attachments.filter((a) => !gone[a.url]);

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] space-y-2 rounded-2xl px-3 py-2 text-sm",
          mine ? "bg-cova-soft" : "border border-cova-line bg-white",
        )}
      >
        {visible.map((a) => (
          <AttachmentView
            key={a.url}
            attachment={a}
            onGone={(url) => setGone((s) => ({ ...s, [url]: true }))}
          />
        ))}
        {message.text && <p className="whitespace-pre-line break-words">{message.text}</p>}
        <p className="text-end text-[11px] text-cova-ink/70">{time}</p>
      </div>
    </div>
  );
}
