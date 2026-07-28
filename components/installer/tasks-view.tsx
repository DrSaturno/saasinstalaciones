"use client";

import Link from "next/link";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { AcceptOrderButton } from "@/components/installer/accept-order-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ViewToggle, useViewMode } from "@/components/shared/view-toggle";
import type { OrderStatus } from "@/types/database";

export type TaskRow = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  accepted_at: string | null;
  site_name: string;
  site_address: string;
  site_city: string;
  company_name: string;
};

type Section = {
  key: string;
  label: string;
  tasks: TaskRow[];
  highlight?: boolean;
  muted?: boolean;
};

/**
 * Mis órdenes, en tarjetas o en lista compacta.
 *
 * Las secciones (por aceptar, aceptadas, cerradas) se mantienen en las dos
 * vistas: son la jerarquía real del trabajo del instalador, no una decoración
 * del modo tarjeta.
 */
export function TasksView({
  toAccept,
  active,
  closed,
}: {
  toAccept: TaskRow[];
  active: TaskRow[];
  closed: TaskRow[];
}) {
  const t = useTranslations("InstallerTasks");
  const common = useTranslations("Common");
  const [mode, setMode] = useViewMode("view:tasks", "board");

  const sections: Section[] = [
    {
      key: "toAccept",
      label: t("toAccept", { count: toAccept.length }),
      tasks: toAccept,
      highlight: true,
    },
    { key: "active", label: t("accepted_section"), tasks: active },
    { key: "closed", label: t("closed"), tasks: closed, muted: true },
  ].filter((section) => section.tasks.length > 0);

  return (
    <>
      <div className="mt-4 flex justify-end">
        <ViewToggle
          value={mode}
          onChange={setMode}
          labels={{ list: common("viewList"), board: common("viewBoard") }}
        />
      </div>

      {sections.map((section) => (
        <section key={section.key} className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {section.highlight ? (
              <BellRing className="size-4 text-primary" aria-hidden="true" />
            ) : null}
            {section.label}
          </h2>

          {mode === "board" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  muted={section.muted}
                  pendingAcceptance={section.key === "toAccept"}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border bg-card">
              {section.tasks.map((task) => (
                <TaskRowItem
                  key={task.id}
                  task={task}
                  muted={section.muted}
                  pendingAcceptance={section.key === "toAccept"}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function TaskRowItem({
  task,
  muted,
  pendingAcceptance,
}: {
  task: TaskRow;
  muted?: boolean;
  pendingAcceptance?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 hover:text-primary">
        <p className="truncate font-medium">{task.site_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {task.title}
          {" · "}
          {[task.site_address, task.site_city].filter(Boolean).join(", ") ||
            task.company_name}
        </p>
      </Link>

      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {task.scheduled_date ?? task.order_number}
      </span>
      <StatusBadge status={task.status} kind="order" />
      {pendingAcceptance ? <AcceptOrderButton orderId={task.id} /> : null}
    </div>
  );
}

function TaskCard({
  task,
  muted,
  pendingAcceptance = false,
}: {
  task: TaskRow;
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
        className={`h-full rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 ${
          muted ? "opacity-60" : ""
        }`}
      >
        {body}
      </div>
    </Link>
  );
}
