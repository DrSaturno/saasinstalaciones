import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMyTasks } from "@/lib/data/tasks";
import { StatusBadge } from "@/components/shared/status-badge";
import { isTerminal } from "@/lib/domain/transitions";

export default async function InstallerTasks() {
  const t = await getTranslations("InstallerTasks");
  const supabase = await createClient();
  const tasks = await fetchMyTasks(supabase);

  const active = tasks.filter((t) => !isTerminal(t.status));
  const closed = tasks.filter((t) => isTerminal(t.status));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("description")}
      </p>

      {tasks.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {active.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}

          {closed.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-medium text-muted-foreground">
                {t("closed")}
              </h2>
              {closed.map((t) => (
                <TaskCard key={t.id} task={t} muted />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  muted,
}: {
  task: Awaited<ReturnType<typeof fetchMyTasks>>[number];
  muted?: boolean;
}) {
  return (
    <Link href={`/tasks/${task.id}`}>
      <div
        className={`rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 ${
          muted ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{task.site_name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {task.title}
            </p>
          </div>
          <StatusBadge status={task.status} kind="order" />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">
            {[task.site_address, task.site_city].filter(Boolean).join(", ") ||
              task.company_name}
          </span>
          <span className="ml-2 shrink-0 font-mono">
            {task.scheduled_date ?? task.order_number}
          </span>
        </div>
      </div>
    </Link>
  );
}
