"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ open, onClose }: CreateGroupModalProps) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  function close() {
    setName("");
    setDescription("");
    setErrors({});
    onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (name.trim().length < 3 || name.trim().length > 60) found.name = t("group.nameLength");
    if (description.trim().length < 10 || description.trim().length > 500)
      found.description = t("group.descLength");
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    toast.push(t("group.created"));
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("group.newGroup")}
      description={t("group.createDesc")}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          id="group-name"
          label={t("group.name")}
          value={name}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextAreaField
          id="group-description"
          label={t("group.purpose")}
          value={description}
          error={errors.description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <DemoNotice>{t("group.demoNote")}</DemoNotice>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            {t("dm.cancel")}
          </Button>
          <Button type="submit">{t("group.create")}</Button>
        </div>
      </form>
    </Modal>
  );
}
