import Link from "next/link";
import { CalendarSync, CircleDollarSign, FolderPlus, Megaphone, Plus, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const actions = [
  { key: "newProject", href: "/projects", icon: FolderPlus },
  { key: "urgentOrder", href: "/orders", icon: Plus },
  { key: "assignPending", href: "/orders", icon: UsersRound },
  { key: "reviewOrders", href: "/orders", icon: CalendarSync },
  { key: "approveWork", href: "/orders", icon: Megaphone },
  { key: "financeReport", href: "/finance", icon: CircleDollarSign },
] as const;

export function DashboardQuickActions() {
  const t = useTranslations("Dashboard");
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{t("quickActionsTitle")}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        {actions.map(({ key, href, icon: Icon }) => (
          <Link key={key} href={href} className="group flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary-soft/25">
            <Icon className="size-4 text-primary" aria-hidden="true" />
            <span>{t(`quickActions.${key}`)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
