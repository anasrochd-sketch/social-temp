import { getSupabase } from "@/lib/supabase/client";
import type { PostAttachment } from "@/types/social";

/**
 * Uploads a media file to a storage bucket and returns the attachment descriptor stored with
 * posts, group messages and DMs.
 *
 * Buckets (created by supabase/migrations):
 *  - "space-media" (default): community posts and group messages — 20261102000001_locale_and_media.sql
 *  - "dm-media": direct-message photos, voice notes and files — 20261102000005_dm_media.sql
 * If a bucket is missing, the error message tells the person to run that SQL first.
 */

/** 25 MB — generous for images, voice notes and short clips. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export function attachmentKind(mime: string, name: string): PostAttachment["kind"] {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)) return "image";
  if (/\.(mp4|webm|mov|mkv)$/i.test(name)) return "video";
  if (/\.(mp3|wav|ogg|m4a|webm)$/i.test(name)) return "audio";
  return "file";
}

export function isVoiceRecording(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(webm|ogg|m4a|mp3|wav)$/i.test(file.name);
}

function safeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(-80) || "file"
  );
}

export async function uploadMedia(
  spaceId: string,
  file: File,
  bucket: "space-media" | "dm-media" = "space-media",
): Promise<{ ok: true; value: PostAttachment } | { ok: false; error: string }> {
  if (file.size > MAX_MEDIA_BYTES) {
    return { ok: false, error: "File is too large (max 25 MB)." };
  }

  const supabase = getSupabase();
  const kind = attachmentKind(file.type, file.name);
  const path = `${spaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });

  if (error) {
    const message = /bucket/i.test(error.message)
      ? `Media storage is not active yet. Ask the project owner to run the SQL setup for the "${bucket}" bucket.`
      : error.message;
    return { ok: false, error: message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    ok: true,
    value: {
      kind,
      url: data.publicUrl,
      name: file.name || kind,
      mime: file.type || "application/octet-stream",
      size: file.size,
    },
  };
}
