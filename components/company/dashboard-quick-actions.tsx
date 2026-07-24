import { CalendarSync, FolderPlus, Megaphone, Plus, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function DashboardQuickActions({
  newProject,
  urgentOrder,
  assignPending,
  reschedule,
  approve,
}: {
  newProject: React.ReactNode;
  urgentOrder: React.ReactNode;
  assignPending: React.ReactNode;
  reschedule: React.ReactNode;
  approve: React.ReactNode;
}) {
  const t = await getTranslations("Dashboard");
  const actions = [
    { key: "newProject", icon: FolderPlus, node: newProject },
    { key: "urgentOrder", icon: Plus, node: urgentOrder },
    { key: "assignPending", icon: UsersRound, node: assignPending },
    { key: "reviewOrders", icon: CalendarSync, node: reschedule },
    { key: "approveWork", icon: Megaphone, node: approve },
  ] as const;
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{t("quickActionsTitle")}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {actions.map(({ key, icon: Icon, node }) => (
          <div key={key} className="[&_button]:h-full [&_button]:w-full [&_button]:justify-start [&_button]:whitespace-normal">
            {node}
            <span className="sr-only"><Icon />{t(`quickActions.${key}`)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
