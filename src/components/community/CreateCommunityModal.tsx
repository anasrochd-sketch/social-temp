"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/community/ChoiceGroup";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translate";
import { COMMUNITY_CATEGORIES, socialActions } from "@/lib/social-store";
import type { CommunityVisibility, PostingPolicy } from "@/types/social";

/** Values + translation keys; the labels are translated where they are shown. */
export const VISIBILITY_CHOICES = [
  {
    value: "public",
    labelKey: "community.public" as MessageKey,
    descKey: "community.visPublicHint" as MessageKey,
  },
  {
    value: "private",
    labelKey: "community.private" as MessageKey,
    descKey: "community.visPrivateHint" as MessageKey,
  },
] as const satisfies readonly {
  value: CommunityVisibility;
  labelKey: MessageKey;
  descKey: MessageKey;
}[];

export const POSTING_CHOICES = [
  {
    value: "everyone",
    labelKey: "community.everyone" as MessageKey,
    descKey: "community.everyoneHint" as MessageKey,
  },
  {
    value: "admins",
    labelKey: "community.ownerAdmins" as MessageKey,
    descKey: "community.ownerAdminsHint" as MessageKey,
  },
  {
    value: "owner",
    labelKey: "community.ownerOnly" as MessageKey,
    descKey: "community.ownerOnlyHint" as MessageKey,
  },
] as const satisfies readonly {
  value: PostingPolicy;
  labelKey: MessageKey;
  descKey: MessageKey;
}[];

/** Translated choice lists for the community forms (create + settings). */
export function useTranslatedChoices() {
  const t = useT();
  return {
    visibilityChoices: VISIBILITY_CHOICES.map((c) => ({
      value: c.value,
      label: t(c.labelKey),
      description: t(c.descKey),
    })),
    postingChoices: POSTING_CHOICES.map((c) => ({
      value: c.value,
      label: t(c.labelKey),
      description: t(c.descKey),
    })),
  };
}

export function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-cova-ink">
        {t("community.category")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink"
      >
        {COMMUNITY_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CreateCommunityModalProps {
  open: boolean;
  onClose: () => void;
  meId: string;
}

export function CreateCommunityModal({ open, onClose, meId }: CreateCommunityModalProps) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { locale } = useI18n();
  const { visibilityChoices, postingChoices } = useTranslatedChoices();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(COMMUNITY_CATEGORIES[0]);
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [postingPolicy, setPostingPolicy] = useState<PostingPolicy>("everyone");
  const [communityLocale, setCommunityLocale] = useState<Locale>(locale);
  const [error, setError] = useState("");

  function close() {
    setName("");
    setDescription("");
    setCategory(COMMUNITY_CATEGORIES[0]);
    setVisibility("public");
    setPostingPolicy("everyone");
    setCommunityLocale(locale);
    setError("");
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await socialActions.createCommunity(meId, {
      name,
      description,
      category,
      visibility,
      postingPolicy,
      hideMembers: false,
      locale: communityLocale,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.push(t("community.createdName", { name: name.trim() }));
    close();
    router.push(`/community/${result.value}`);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("community.create")}
      description={t("community.createHint")}
    >
      <form onSubmit={onSubmit} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pe-1">
        <TextField
          id="community-name"
          label={t("community.name")}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <TextAreaField
          id="community-description"
          label={t("community.description")}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
        <CategorySelect id="community-category" value={category} onChange={setCategory} />
        <div className="space-y-1.5">
          <label htmlFor="community-language" className="block text-sm font-medium text-cova-ink">
            {t("community.language")}
          </label>
          <p className="text-xs text-cova-mute">{t("community.languageHint")}</p>
          <select
            id="community-language"
            value={communityLocale}
            onChange={(e) => setCommunityLocale(e.target.value as Locale)}
            className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </div>
        <ChoiceGroup
          legend={t("community.joinQuestion")}
          value={visibility}
          onChange={setVisibility}
          choices={visibilityChoices}
        />
        <ChoiceGroup
          legend={t("community.postingQuestion")}
          value={postingPolicy}
          onChange={setPostingPolicy}
          choices={postingChoices}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-red-800">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("community.createButton")}</Button>
        </div>
      </form>
    </Modal>
  );
}
