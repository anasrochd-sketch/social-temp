"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useI18n, useT } from "@/i18n/client";
import { navSections } from "@/lib/navigation";
import { useSocial } from "@/lib/social-store";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const { dir } = useI18n();
  const social = useSocial();
  const unread = social.notifications.filter((n) => n.readAt === null).length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-cova-ink/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label={t("common.mainNav")}
        className={cn(
          "fixed inset-y-0 z-40 flex w-64 flex-col border-cova-line bg-white transition-transform lg:translate-x-0",
          dir === "rtl" ? "right-0 border-l border-r-0" : "left-0 border-r border-l-0",
          open ? "translate-x-0" : dir === "rtl" ? "translate-x-full" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo href="/dashboard" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeNav")}
            className="rounded-lg p-1.5 text-cova-mute hover:bg-cova-pale lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {navSections.map((section) => (
            <div key={section.titleKey} className="mt-5 first:mt-2">
              <p className="px-3 pb-1.5 text-xs font-medium text-cova-mute">
                {t(section.titleKey)}
              </p>
              <ul className="space-y-0.5">
                {section.items.map(({ href, labelKey, label, icon: Icon }, index) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  const itemKey = `${section.titleKey}-${href}-${index}`;
                  const itemLabel = label ? (label as Record<string, string>)["en"] : undefined;
                  const text = itemLabel ?? (labelKey ? t(labelKey) : href);
                  return (
                    <li key={itemKey}>
                      <Link
                        href={href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          dir === "rtl" && "flex-row-reverse",
                          active
                            ? "bg-cova-pale text-cova-ink"
                            : "text-cova-mute hover:bg-cova-bg hover:text-cova-ink",
                        )}
                      >
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        <span className={cn("flex-1", dir === "rtl" && "text-right")}>{text}</span>
                        {href === "/notifications" && unread > 0 && (
                          <span className="rounded-full bg-cova-soft px-2 py-0.5 text-xs text-cova-ink">
                            {unread}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
