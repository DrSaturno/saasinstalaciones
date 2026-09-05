"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  Gauge,
  Megaphone,
  MessageSquareText,
  Route,
  Settings,
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
  settings: Settings,
  route: Route,
  agenda: CalendarDays,
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
              // El ítem activo se marca con fondo sólido y una barra a la
              // izquierda: dos señales, no sólo color, y legible al sol.
              "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              active
                ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-white/80"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
