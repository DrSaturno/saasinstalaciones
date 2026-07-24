"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Gauge,
  Megaphone,
  MessageSquareText,
  UserRound,
  UsersRound,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "@/types/navigation";
import { useTranslations } from "next-intl";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: Gauge,
  projects: BriefcaseBusiness,
  orders: ClipboardList,
  team: UsersRound,
  broadcasts: Megaphone,
  finance: WalletCards,
  tasks: Wrench,
  jobs: BriefcaseBusiness,
  profile: UserRound,
  companies: Building2,
  clients: Building2,
  messages: MessageSquareText,
};

export function SidebarNav({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-5" aria-label={t("primaryNavigation")}>
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? BarChart3;
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary-soft/70 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
