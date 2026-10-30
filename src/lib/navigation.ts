import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translate";
import {
  Award,
  BookOpen,
  Bell,
  CircleUserRound,
  ClipboardList,
  Code2,
  FolderOpen,
  Heart,
  LayoutDashboard,
  MessageSquare,
  Mic,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Existing catalog key, or `label` for items translated outside the main catalog. */
  labelKey?: MessageKey;
  label?: Record<Locale, string>;
  icon: LucideIcon;
}

export interface NavSection {
  titleKey: MessageKey;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    titleKey: "nav.learn",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/courses", labelKey: "nav.courses", icon: BookOpen },
      { href: "/assignments", labelKey: "nav.assignments", icon: ClipboardList },
      { href: "/coding", labelKey: "nav.coding", icon: Code2 },
      { href: "/challenges", labelKey: "nav.challenges", icon: Award },
      { href: "/resources", labelKey: "nav.resources", icon: FolderOpen },
    ],
  },
  {
    titleKey: "nav.connect",
    items: [
      { href: "/friends", labelKey: "nav.friends", icon: Heart },
      { href: "/community", labelKey: "nav.community", icon: Users },
      { href: "/messages", labelKey: "nav.messages", icon: MessageSquare },
      { href: "/voicing", label: { en: "Voicing", fr: "Voicing", ar: "Voicing" }, icon: Mic },
      { href: "/groups", labelKey: "nav.groups", icon: UsersRound },
      { href: "/leaderboard", labelKey: "nav.leaderboard", icon: Trophy },
    ],
  },
  {
    titleKey: "nav.account",
    items: [
      { href: "/profile", labelKey: "nav.profile", icon: CircleUserRound },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
      { href: "/admin", labelKey: "nav.admin", icon: ShieldCheck },
    ],
  },
];
