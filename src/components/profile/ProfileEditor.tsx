"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, CircleUserRound, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { levelFor } from "@/lib/progress";
import { splitTags, useMyProfile, type ProfileFormValues } from "@/lib/profile";
import { useHydrated } from "@/lib/use-hydrated";

export function ProfileEditor() {
  const t = useT();
  const toast = useToast();
  const hydrated = useHydrated();
  const { profile, loading, saving, save, uploadAvatar, persistAvatar } = useMyProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [domain, setDomain] = useState("");
  const [progRaw, setProgRaw] = useState("");
  const [spokenRaw, setSpokenRaw] = useState("");
  const [bio, setBio] = useState("");

  // Fill the form once the profile row has loaded.
  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing form fields from the loaded row
    setDisplayName(profile.display_name ?? "");
    setHeadline(profile.headline ?? "");
    setDomain(profile.domain ?? "");
    setProgRaw((profile.prog_languages ?? []).join(", "));
    setSpokenRaw((profile.spoken_languages ?? []).join(", "));
    setBio(profile.bio ?? "");
  }, [profile]);

  if (!hydrated || loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={CircleUserRound}
        title={t("page.profile.title")}
        description={t("profile.signin")}
        action={
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
          >
            {t("common.signin")}
          </Link>
        }
      />
    );
  }

  const level = levelFor(profile.xp ?? 0);

  async function onPhotoPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const uploaded = await uploadAvatar(file);
    if (!uploaded.ok) {
      toast.push(uploaded.error);
      setUploading(false);
      return;
    }
    const persisted = await persistAvatar(uploaded.value);
    setUploading(false);
    toast.push(persisted.ok ? t("profile.photoSaved") : persisted.error);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const values: ProfileFormValues = {
      displayName,
      headline,
      domain,
      progLanguages: splitTags(progRaw),
      spokenLanguages: splitTags(spokenRaw),
      bio,
    };
    const result = await save(values);
    toast.push(result.ok ? t("profile.saved") : result.error);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <Card>
        <CardBody className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <Avatar
              name={displayName || "Student"}
              src={profile.avatar_url}
              tone="soft"
              size="lg"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={t("profile.changePhoto")}
              className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-cova-soft text-cova-ink hover:bg-cova-muted"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPhotoPicked}
            className="hidden"
          />
          <div className="min-w-0">
            <p className="truncate font-semibold">{displayName || "Student"}</p>
            <p className="truncate text-sm text-cova-mute">{headline || profile.user_code}</p>
            <p className="mt-1 font-mono text-xs text-cova-mute">{profile.user_code}</p>
          </div>
          <div className="w-full pt-1">
            <div className="flex items-baseline justify-between gap-2 text-xs text-cova-mute">
              <span>
                {t("profile.level", { level: level.level })}
              </span>
              <span>
                {t("profile.xpLabel", { xp: (profile.xp ?? 0).toLocaleString() })}
              </span>
            </div>
            <ProgressBar value={level.into} max={level.needed} label={t("profile.level", { level: level.level })} className="mt-1.5" />
          </div>
          <p className="text-[11px] text-cova-mute">{t("profile.photoHint")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <TextField
              id="profile-display-name"
              label={t("profile.displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              required
            />
            <TextField
              id="profile-headline"
              label={t("profile.headline")}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={120}
              placeholder={t("profile.headlinePlaceholder")}
            />
            <TextField
              id="profile-domain"
              label={t("profile.domain")}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              maxLength={80}
              placeholder={t("profile.domainPlaceholder")}
            />
            <TextField
              id="profile-prog-languages"
              label={t("profile.progLanguages")}
              value={progRaw}
              onChange={(e) => setProgRaw(e.target.value)}
              placeholder="Python, JavaScript, C++"
              hint={t("profile.tagsHint")}
            />
            <TextField
              id="profile-spoken-languages"
              label={t("profile.spokenLanguages")}
              value={spokenRaw}
              onChange={(e) => setSpokenRaw(e.target.value)}
              placeholder="English, Français, العربية"
              hint={t("profile.tagsHint")}
            />
            <TextAreaField
              id="profile-bio"
              label={t("profile.bio")}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder={t("profile.bioPlaceholder")}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? t("profile.saving") : t("profile.save")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
