import { ArrowUpRight, CalendarSync, ClipboardList, FolderPlus, Megaphone, Plus, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function DashboardQuickActions({
  newProject,
  urgentOrder,
  assignPending,
  reschedule,
  approve,
  viewOrders,
}: {
  newProject: React.ReactNode;
  urgentOrder: React.ReactNode;
  assignPending: React.ReactNode;
  reschedule: React.ReactNode;
  approve: React.ReactNode;
  viewOrders: React.ReactNode;
}) {
  const t = await getTranslations("Dashboard");
  const actions = [
    { key: "newProject", icon: FolderPlus, node: newProject },
    { key: "urgentOrder", icon: Plus, node: urgentOrder },
    { key: "assignPending", icon: UsersRound, node: assignPending },
    { key: "reviewOrders", icon: CalendarSync, node: reschedule },
    { key: "approveWork", icon: Megaphone, node: approve },
    { key: "viewOrders", icon: ClipboardList, node: viewOrders },
  ] as const;
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{t("quickActionsTitle")}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map(({ key, icon: Icon, node }) => (
          <div
            key={key}
            className="group relative flex items-center gap-3 overflow-hidden rounded-xl border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/25 focus-within:border-primary/60 [&_:is(a,button)]:absolute [&_:is(a,button)]:inset-0 [&_:is(a,button)]:size-full [&_:is(a,button)]:rounded-xl [&_:is(a,button)]:!border-0 [&_:is(a,button)]:!bg-transparent [&_:is(a,button)]:!text-transparent"
          >
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary transition-transform group-hover:scale-105">
              <Icon className="size-[18px]" />
            </span>
            <span aria-hidden="true" className="text-sm font-medium leading-snug">{t(`quickActions.${key}`)}</span>
            <ArrowUpRight aria-hidden="true" className="ml-auto size-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            {node}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
