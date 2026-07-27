import Link from "next/link";
import { BellRing } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMyTasks } from "@/lib/data/tasks";
import { AcceptOrderButton } from "@/components/installer/accept-order-button";
import { StatusBadge } from "@/components/shared/status-badge";
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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      {tasks.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {toAccept.length > 0 && (
            <>
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <BellRing className="size-4 text-primary" aria-hidden="true" />
                {t("toAccept", { count: toAccept.length })}
              </h2>
              {toAccept.map((task) => (
                <TaskCard key={task.id} task={task} pendingAcceptance />
              ))}
            </>
          )}

          {active.length > 0 && (
            <>
              {toAccept.length > 0 && (
                <h2 className="mt-4 text-sm font-medium text-muted-foreground">
                  {t("accepted_section")}
                </h2>
              )}
              {active.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </>
          )}

          {closed.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-medium text-muted-foreground">
                {t("closed")}
              </h2>
              {closed.map((task) => (
                <TaskCard key={task.id} task={task} muted />
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
  pendingAcceptance = false,
}: {
  task: Awaited<ReturnType<typeof fetchMyTasks>>[number];
  muted?: boolean;
  pendingAcceptance?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{task.site_name}</p>
          <p className="truncate text-sm text-muted-foreground">{task.title}</p>
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
    </>
  );

  // Con aceptación pendiente la tarjeta no es un link entero: el botón necesita
  // su propio click sin que se dispare la navegación.
  if (pendingAcceptance) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary-soft/15 p-4">
        <Link href={`/tasks/${task.id}`} className="block">
          {body}
        </Link>
        <div className="mt-3 flex justify-end">
          <AcceptOrderButton orderId={task.id} />
        </div>
      </div>
    );
  }

  return (
    <Link href={`/tasks/${task.id}`}>
      <div
        className={`rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 ${
          muted ? "opacity-60" : ""
        }`}
      >
        {body}
      </div>
    </Link>
  );
}
