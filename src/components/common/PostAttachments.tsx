"use client";

import { Download, FileText } from "lucide-react";
import { useT } from "@/i18n/client";
import type { PostAttachment } from "@/types/social";

/** Renders the media attachments of a post or group message. */
export function PostAttachments({ attachments }: { attachments: PostAttachment[] }) {
  const t = useT();
  if (!attachments.length) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((a) => {
        if (a.kind === "image") {
          return (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- storage URL, no optimizable next/image domain */}
              <img
                src={a.url}
                alt={a.name || t("media.image")}
                loading="lazy"
                className="max-h-80 rounded-xl border border-cova-line object-cover"
              />
            </a>
          );
        }
        if (a.kind === "video") {
          return (
            <video
              key={a.url}
              src={a.url}
              controls
              preload="metadata"
              className="max-h-80 w-full max-w-md rounded-xl border border-cova-line"
            />
          );
        }
        if (a.kind === "audio") {
          return (
            <audio
              key={a.url}
              src={a.url}
              controls
              preload="metadata"
              className="w-full max-w-sm"
            />
          );
        }
        return (
          <a
            key={a.url}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-sm items-center gap-2 rounded-lg border border-cova-line px-3 py-2 text-sm hover:bg-cova-bg"
          >
            <FileText className="h-4 w-4 shrink-0 text-cova-mute" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{a.name || t("media.file")}</span>
            <Download className="h-4 w-4 shrink-0 text-cova-mute" aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
