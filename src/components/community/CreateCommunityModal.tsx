"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/community/ChoiceGroup";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { COMMUNITY_CATEGORIES, socialActions } from "@/lib/social-store";
import type { CommunityVisibility, PostingPolicy } from "@/types/social";

export const VISIBILITY_CHOICES = [
  {
    value: "public",
    label: "Public",
    description: "Listed for everyone. Anyone with an account can join instantly.",
  },
  {
    value: "private",
    label: "Private",
    description: "Hidden from the list. People join with your code or link, then an admin approves.",
  },
] as const satisfies readonly { value: CommunityVisibility; label: string; description: string }[];

export const POSTING_CHOICES = [
  { value: "everyone", label: "All members", description: "Every member can post." },
  { value: "admins", label: "Owner and admins", description: "Only you and admins can post." },
  { value: "owner", label: "Only me", description: "Only the creator can post." },
] as const satisfies readonly { value: PostingPolicy; label: string; description: string }[];

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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(COMMUNITY_CATEGORIES[0]);
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [postingPolicy, setPostingPolicy] = useState<PostingPolicy>("everyone");
  const [error, setError] = useState("");

  function close() {
    setName("");
    setDescription("");
    setCategory(COMMUNITY_CATEGORIES[0]);
    setVisibility("public");
    setPostingPolicy("everyone");
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
});
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.push(`"${name.trim()}" created`);
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
        <ChoiceGroup
          legend={t("community.joinQuestion")}
          value={visibility}
          onChange={setVisibility}
          choices={VISIBILITY_CHOICES}
        />
        <ChoiceGroup
          legend={t("community.postingQuestion")}
          value={postingPolicy}
          onChange={setPostingPolicy}
          choices={POSTING_CHOICES}
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
