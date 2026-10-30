"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { useHydrated } from "@/lib/use-hydrated";
import type { UserSettings } from "@/types";

const visibilityKeys: Record<UserSettings["profileVisibility"], MessageKey> = {
  everyone: "settings.vis.everyone",
  groups: "settings.vis.groups",
  private: "settings.vis.private",
};

function SettingsFormInner({ initial }: { initial: UserSettings }) {
  const toast = useToast();
  const t = useT();
  const visibilityLabels = Object.fromEntries(
    Object.entries(visibilityKeys).map(([k, key]) => [k, t(key)]),
  ) as Record<UserSettings["profileVisibility"], string>;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<{ displayName?: string; email?: string }>({});
  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (values.displayName.trim().length < 2) found.displayName = t("settings.err.displayName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim()))
      found.email = t("settings.err.email");
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    demoActions.saveSettings({
      ...values,
      displayName: values.displayName.trim(),
      email: values.email.trim(),
    });
    toast.push(t("settings.saved"));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-6">
      <Card>
        <CardHeader title={t("settings.profile")} description={t("settings.profileDesc")} />
        <CardBody className="space-y-4">
          <TextField
            id="displayName"
            label={t("settings.displayName")}
            value={values.displayName}
            error={errors.displayName}
            onChange={(e) => set("displayName", e.target.value)}
          />
          <TextField
            id="settings-email"
            label={t("settings.email")}
            type="email"
            value={values.email}
            error={errors.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <TextAreaField
            id="bio"
            label={t("settings.bio")}
            value={values.bio}
            onChange={(e) => set("bio", e.target.value)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("lang.label")} description={t("lang.description")} />
        <CardBody>
          <LanguageSwitcher />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.notifications")} />
        <CardBody className="divide-y divide-cova-line py-2">
          <Switch
            label={t("settings.emailNotif")}
            description={t("settings.emailNotifDesc")}
            checked={values.emailNotifications}
            onChange={(v) => set("emailNotifications", v)}
          />
          <Switch
            label={t("settings.messageAlerts")}
            description={t("settings.messageAlertsDesc")}
            checked={values.messageAlerts}
            onChange={(v) => set("messageAlerts", v)}
          />
          <Switch
            label={t("settings.digest")}
            description={t("settings.digestDesc")}
            checked={values.weeklyDigest}
            onChange={(v) => set("weeklyDigest", v)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.privacy")} />
        <CardBody>
          <SelectFilter
            label={t("settings.visibility")}
            options={Object.values(visibilityLabels)}
            value={visibilityLabels[values.profileVisibility]}
            onChange={(e) => {
              const key = (Object.keys(visibilityKeys) as UserSettings["profileVisibility"][]).find(
                (k) => visibilityLabels[k] === e.target.value,
              );
              if (key) set("profileVisibility", key);
            }}
          />
        </CardBody>
      </Card>

      <DemoNotice>{t("settings.demoNotice")}</DemoNotice>
      <div className="flex gap-2">
        <Button type="submit">{t("common.save")}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setValues(initial);
            setErrors({});
          }}
        >
          {t("common.discard")}
        </Button>
      </div>
    </form>
  );
}

export function SettingsForm() {
  const { settings } = useDemoState();
  const hydrated = useHydrated();
  // Re-mount once the saved browser state has loaded so the form starts from saved values.
  return <SettingsFormInner key={hydrated ? "ready" : "loading"} initial={settings} />;
}
