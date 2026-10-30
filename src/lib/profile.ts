"use client";

import { useCallback, useEffect, useState } from "react";

import { fail, ok } from "@/lib/result";

import type { ActionResult } from "@/types/social";

import { getSupabase } from "@/lib/supabase/client";

/**
 * The signed-in person's editable profile (profiles table). Selects * so the page
 * still works, with empty new fields, when the profile migration hasn't run yet.
 */
export interface MyProfile {
  id: string;
  user_code: string | null;
  display_name: string | null;
  bio: string | null;
  headline: string | null;
  domain: string | null;
  prog_languages: string[] | null;
  spoken_languages: string[] | null;
  avatar_url: string | null;
  xp: number | null;
}

export interface ProfileFormValues {
  displayName: string;
  headline: string;
  domain: string;
  progLanguages: string[];
  spokenLanguages: string[];
  bio: string;
}

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Splits a comma-separated field into clean, deduplicated tags (max 12). */
export function splitTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim().slice(0, 40);
    if (value) seen.add(value);
  }
  return [...seen].slice(0, 12);
}

export function useMyProfile() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = getSupabase();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (error) throw error;
        if (active) setProfile((data ?? null) as MyProfile | null);
      } catch (error) {
        console.error("Unable to load the profile:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Uploads the photo to the public avatars bucket and returns its public URL. */
  const uploadAvatar = useCallback(async (file: File): Promise<ActionResult<string>> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to change your photo.");
    if (file.size > AVATAR_MAX_BYTES) return fail("The photo must be 2 MB or smaller.");

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
    const path = `${auth.user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      if (error.message.includes("mime type") || error.message.includes("file size")) {
        return fail("The photo must be a PNG, JPG, WebP or GIF of 2 MB or smaller.");
      }
      return fail(error.message);
    }

    // Best effort: remove the previous photo once the new one is in place.
    const previous = profile?.avatar_url;
    if (previous && previous.includes(`/${AVATAR_BUCKET}/`)) {
      const oldPath = previous.split(`/${AVATAR_BUCKET}/`)[1];
      if (oldPath && oldPath.startsWith(`${auth.user.id}/`)) {
        void supabase.storage.from(AVATAR_BUCKET).remove([decodeURIComponent(oldPath)]);
      }
    }
    return ok(supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl);
  }, [profile?.avatar_url]);

  /** Persists the avatar URL after a successful upload (photo applies right away). */
  const persistAvatar = useCallback(async (url: string): Promise<ActionResult> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to change your photo.");
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", auth.user.id)
      .select("id")
      .single();
    if (error) return fail("Could not save the photo. Please try again.");
    setProfile((current) => (current ? { ...current, avatar_url: url } : current));
    return ok(undefined);
  }, []);

  const save = useCallback(async (values: ProfileFormValues): Promise<ActionResult> => {
    const displayName = values.displayName.trim();
    if (displayName.length < 2) return fail("The name needs at least 2 characters.");

    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.slice(0, 60),
          headline: values.headline.trim().slice(0, 120),
          domain: values.domain.trim().slice(0, 80),
          prog_languages: values.progLanguages,
          spoken_languages: values.spokenLanguages,
          bio: values.bio.trim().slice(0, 500),
        })
        .eq("id", auth.user.id)
        .select("id")
        .single();
      if (error) {
        if (error.message.includes("schema cache") || error.code === "42703") {
          return fail("Run the profile migration in Supabase first (see supabase/migrations).");
        }
        throw error;
      }
      return ok(undefined);
    } catch (error) {
      console.error("Unable to save the profile:", error);
      return fail("Could not save the profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  return { profile, loading, saving, save, uploadAvatar, persistAvatar };
}
