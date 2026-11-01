"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Mic, Paperclip, Send, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { MAX_MEDIA_BYTES, uploadMedia } from "@/lib/media-upload";
import { cn } from "@/lib/utils";
import type { PostAttachment } from "@/types/social";

/**
 * WhatsApp-style composer for direct messages: text, attached files
 * (photo / video / any file) and recorded voice notes, all queued as
 * attachments and sent together with the caption text.
 */

/** Voice notes are capped at two minutes, then recording stops on its own. */
const MAX_VOICE_SECONDS = 120;

const VOICE_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickVoiceMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return VOICE_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function voiceExtension(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

export function ChatComposer({
  onSend,
  placeholder,
  label,
}: {
  /** Sends the caption text plus every queued attachment; returns the action result. */
  onSend: (text: string, attachments: PostAttachment[]) => Promise<{ ok: boolean; error?: string }>;
  placeholder: string;
  label: string;
}) {
  const t = useT();
  const toast = useToast();

  const [draft, setDraft] = useState("");
  const [queue, setQueue] = useState<PostAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Leaving the page (or the conversation) always releases the microphone.
  useEffect(
    () => () => {
      stopTimer();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    for (const file of files) {
      if (file.size > MAX_MEDIA_BYTES) {
        toast.push(t("dm.fileTooLarge"));
        continue;
      }
      setUploading(true);
      try {
        const result = await uploadMedia("dm", file, "dm-media");
        if (result.ok) {
          setQueue((q) => [...q, result.value]);
        } else {
          toast.push(result.error);
        }
      } finally {
        setUploading(false);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Two minutes is the limit; the timer stops itself through the effect below.
  useEffect(() => {
    if (recording && seconds >= MAX_VOICE_SECONDS) stopVoice();
  }, [recording, seconds]);

  async function startVoice() {
    const mime = pickVoiceMime();
    if (!mime) {
      toast.push(t("dm.micUnavailable"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        stopTimer();
        setRecording(false);
        setSeconds(0);

        if (cancelledRef.current || chunksRef.current.length === 0) return;
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `voice-note-${Date.now()}.${voiceExtension(type)}`, { type });
        void addFiles([file]);
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.push(t("dm.micDenied"));
    }
  }

  function stopVoice() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancelVoice() {
    cancelledRef.current = true;
    stopVoice();
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (busy || uploading || recording) return;

    const text = draft.trim();
    if (!text && queue.length === 0) return;

    setBusy(true);
    const result = await onSend(text, queue);
    setBusy(false);

    if (!result.ok) {
      toast.push(result.error ?? "");
      return;
    }
    setDraft("");
    setQueue([]);
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(e.target.files ?? []));
  }

  return (
    <div className="border-t border-cova-line">
      {queue.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-3 pt-3">
          {queue.map((a) => (
            <li
              key={a.url}
              className="flex items-center gap-2 rounded-lg border border-cova-line bg-cova-bg py-1 pe-1 ps-2"
            >
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <span className="max-w-[10rem] truncate text-xs">{a.name}</span>
              )}
              <button
                type="button"
                aria-label={t("dm.removeAttachment")}
                onClick={() => setQueue((q) => q.filter((x) => x.url !== a.url))}
                className="rounded p-0.5 hover:bg-cova-pale"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {recording ? (
        <div className="flex items-center gap-3 p-3">
          <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600">
            <span
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
              aria-hidden="true"
            />
            {t("dm.recording", { seconds: String(seconds) })}
          </span>
          <div className="flex-1" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t("dm.cancel")}
            onClick={cancelVoice}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("dm.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={stopVoice} aria-label={t("dm.stop")}>
            <Square className="h-4 w-4" aria-hidden="true" /> {t("dm.stop")}
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void send(e)} className="flex items-center gap-2 p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
            onChange={onFilePick}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            aria-label={t("dm.attach")}
            title={t("dm.attach")}
            disabled={uploading || busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full p-2 text-cova-mute hover:bg-cova-pale hover:text-cova-ink disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("dm.mic")}
            title={t("dm.mic")}
            disabled={uploading || busy}
            onClick={() => void startVoice()}
            className="rounded-full p-2 text-cova-mute hover:bg-cova-pale hover:text-cova-ink disabled:opacity-50"
          >
            <Mic className="h-5 w-5" aria-hidden="true" />
          </button>
          <input
            aria-label={label}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={uploading ? t("dm.uploading") : placeholder}
            className="h-10 min-w-0 flex-1 rounded-full border border-cova-line px-4 text-sm placeholder:text-cova-mute"
          />
          <Button
            type="submit"
            aria-label={t("messages.send")}
            disabled={busy || uploading || (!draft.trim() && queue.length === 0)}
            className={cn("rounded-full px-4")}
          >
            <Send className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        </form>
      )}
    </div>
  );
}
