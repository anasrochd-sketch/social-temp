"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileUp, ImageIcon, Loader2, Mic, Square, Video, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { MAX_MEDIA_BYTES, uploadMedia } from "@/lib/media-upload";
import { cn } from "@/lib/utils";
import type { PostAttachment } from "@/types/social";

/**
 * Media picker for post and message composers: image, camera, video, voice note
 * and any file. Files upload right away to the "space-media" bucket; the chosen
 * attachments are handed to the parent through onChange.
 */
export function MediaComposer({
  spaceId,
  disabled: disabledProp,
  onChange,
}: {
  spaceId: string;
  disabled?: boolean;
  onChange: (attachments: PostAttachment[]) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<PostAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const emit = useCallback(
    (next: PostAttachment[]) => {
      setItems(next);
      onChange(next);
    },
    [onChange],
  );

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const add = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setError("");

      if (file.size > MAX_MEDIA_BYTES) {
        setError(t("media.tooLarge"));
        return;
      }

      setBusy(true);
      const result = await uploadMedia(spaceId, file);
      setBusy(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      emit([...items, result.value]);
    },
    [emit, items, spaceId, t],
  );

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        void add([file] as unknown as FileList);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError(t("media.micDenied"));
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const remove = (url: string) => emit(items.filter((a) => a.url !== url));

  const disabled = disabledProp || busy || recording;

  return (
    <div className="space-y-2">
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => imageRef.current?.click()}
          aria-label={t("media.image")}
          title={t("media.image")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-cova-mute transition-colors hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
        >
          <ImageIcon className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          aria-label={t("media.camera")}
          title={t("media.camera")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-cova-mute transition-colors hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
        >
          <Camera className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => videoRef.current?.click()}
          aria-label={t("media.video")}
          title={t("media.video")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-cova-mute transition-colors hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
        >
          <Video className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          aria-label={t("media.file")}
          title={t("media.file")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-cova-mute transition-colors hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
        >
          <FileUp className="h-4.5 w-4.5" />
        </button>
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            aria-label={t("media.stopRecording")}
            title={t("media.stopRecording")}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-red-100 px-2 text-xs font-medium text-red-700"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void startRecording()}
            aria-label={t("media.voice")}
            title={t("media.voice")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-cova-mute transition-colors hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
          >
            <Mic className="h-4.5 w-4.5" />
          </button>
        )}
        {busy && (
          <span className="flex items-center gap-1 text-xs text-cova-mute">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t("media.uploading")}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((a) => (
            <li
              key={a.url}
              className="flex items-center gap-1.5 rounded-lg border border-cova-line bg-cova-bg px-2 py-1 text-xs"
            >
              <span className="max-w-40 truncate">{a.name}</span>
              <button
                type="button"
                aria-label={t("media.remove")}
                onClick={() => remove(a.url)}
                className="rounded p-0.5 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className={cn("text-xs font-medium text-red-700")}>
          {error}
        </p>
      )}
    </div>
  );
}
