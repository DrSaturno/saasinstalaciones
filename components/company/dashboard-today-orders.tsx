import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardTodayOrders({ orders }: { orders: DashboardOverview["todayOrders"] }) {
  const t = useTranslations("Dashboard");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("todayOrdersTitle")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("todayOrdersDescription")}</p>
      </CardHeader>
      <CardContent className="px-0">
        {orders.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("emptyToday")}</p>
        ) : (
          <div className="divide-y">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="group grid gap-2 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:grid-cols-[110px_1fr_auto] sm:items-center">
                <span className="font-mono text-xs text-muted-foreground">{order.number}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate font-medium">{order.title}<ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" /></p>
                  <p className="truncate text-xs text-muted-foreground">{order.projectName} · {order.siteName}{order.zone ? ` · ${order.zone}` : ""}</p>
                </div>
                <StatusBadge status={order.status} kind="order" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
