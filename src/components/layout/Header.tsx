"use client";

import { useEffect, useState } from "react";
import { Menu, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { UserMenu } from "@/components/layout/UserMenu";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { levelFor } from "@/lib/progress";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const [xp, setXp] = useState(0);
  const { dir } = useI18n();
  const t = useT();
  const { level } = levelFor(xp);

  useEffect(() => {
    let active = true;

    async function loadXp() {
      try {
        const supabase = getSupabase();
        const { data: authData } = await supabase.auth.getUser();

        if (!authData.user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("xp")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (active && profile) {
          setXp(profile.xp ?? 0);
        }
      } catch {
        // Keep the default XP if the profile cannot be loaded.
      }
    }

    void loadXp();

    return () => {
      active = false;
    };
  }, []);

  return (
    <header
      dir={dir}
      className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-cova-line bg-white/90 px-4 backdrop-blur sm:px-6"
    >
      <div
        className={dir === "rtl" ? "order-2 flex items-center gap-3" : "flex items-center gap-3"}
      >
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={t("common.openNav")}
          className="rounded-lg p-2 text-cova-ink hover:bg-cova-pale lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Badge tone="outline">COVA Workspace</Badge>
      </div>

      <div
        className={dir === "rtl" ? "order-1 flex items-center gap-2" : "flex items-center gap-2"}
      >
        <span className="hidden items-center gap-1.5 rounded-full bg-cova-pale px-3 py-1 text-xs font-medium text-cova-ink sm:inline-flex">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Level {level} · {xp.toLocaleString("en-US")} XP
        </span>
        <NotificationsPanel />
        <LanguageSwitcher className="hidden sm:inline-flex" />
        <UserMenu />
      </div>
    </header>
  );
}
