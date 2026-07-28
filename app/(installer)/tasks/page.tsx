import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMyTasks } from "@/lib/data/tasks";
import { TasksView } from "@/components/installer/tasks-view";
import { isTerminal } from "@/lib/domain/transitions";

export default async function InstallerTasks() {
  const t = await getTranslations("InstallerTasks");
  const supabase = await createClient();
  const tasks = await fetchMyTasks(supabase);

  const open = tasks.filter((task) => !isTerminal(task.status));
  // Asignadas que todavía no confirmó: van primero, son la decisión pendiente.
  const toAccept = open.filter((task) => !task.accepted_at);
  const active = open.filter((task) => task.accepted_at);
  const closed = tasks.filter((task) => isTerminal(task.status));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      {tasks.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <TasksView toAccept={toAccept} active={active} closed={closed} />
      )}
    </div>
  );
}
