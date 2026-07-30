"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { ORDER_STATUS, ORDER_STATUS_ORDER } from "@/lib/domain/status";
import { AcceptOrderButton } from "@/components/installer/accept-order-button";
import { FilterChip } from "@/components/shared/filter-chip";
import { StatusBadge } from "@/components/shared/status-badge";
import { ViewToggle, useViewMode } from "@/components/shared/view-toggle";
import { Input } from "@/components/ui/input";
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
  company_id: string;
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
  showCompanyGroups,
}: {
  toAccept: TaskRow[];
  active: TaskRow[];
  closed: TaskRow[];
  showCompanyGroups: boolean;
}) {
  const t = useTranslations("InstallerTasks");
  const statusT = useTranslations("Status");
  const common = useTranslations("Common");
  const [mode, setMode] = useViewMode("view:tasks", "board");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");

  // Los contadores se calculan sobre TODO, no sobre lo ya filtrado: un chip que
  // se recalcula con su propio filtro se queda siempre en su propio número.
  const all = useMemo(() => [...toAccept, ...active, ...closed], [toAccept, active, closed]);
  const counts = useMemo(() => {
    const map = new Map<OrderStatus, number>();
    for (const task of all) map.set(task.status, (map.get(task.status) ?? 0) + 1);
    return map;
  }, [all]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (task: TaskRow) =>
      (status === "all" || task.status === status) &&
      (needle.length === 0 ||
        [task.site_name, task.title, task.order_number, task.site_city]
          .some((field) => field.toLowerCase().includes(needle)));
  }, [status, query]);

  const filtered = { toAccept: toAccept.filter(matches), active: active.filter(matches), closed: closed.filter(matches) };
  const visibleCount = filtered.toAccept.length + filtered.active.length + filtered.closed.length;
  const filtering = status !== "all" || query.trim().length > 0;

  const sections: Section[] = [
    {
      key: "toAccept",
      label: t("toAccept", { count: filtered.toAccept.length }),
      tasks: filtered.toAccept,
      highlight: true,
    },
    { key: "active", label: t("accepted_section"), tasks: filtered.active },
    { key: "closed", label: t("closed"), tasks: filtered.closed, muted: true },
  ].filter((section) => section.tasks.length > 0);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <FilterChip
            active={status === "all"}
            onClick={() => setStatus("all")}
            label={t("filterAll")}
            count={all.length}
          />
          {/* Sólo los estados presentes: una lista de siete chips con seis en
              cero es ruido, no un filtro. */}
          {ORDER_STATUS_ORDER.filter((value) => counts.has(value)).map((value) => (
            <FilterChip
              key={value}
              active={status === value}
              onClick={() => setStatus((current) => (current === value ? "all" : value))}
              label={statusT(ORDER_STATUS[value].key)}
              count={counts.get(value) ?? 0}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-44 sm:w-56"
            aria-label={t("searchPlaceholder")}
          />
          <ViewToggle
            value={mode}
            onChange={setMode}
            labels={{ list: common("viewList"), board: common("viewBoard") }}
          />
        </div>
      </div>

      {filtering && visibleCount === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : null}

      {sections.map((section) => {
        const groups = groupTasks(section.tasks, showCompanyGroups);
        return (
          <section key={section.key} className="mt-6">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {section.highlight ? (
                <BellRing className="size-4 text-primary" aria-hidden="true" />
              ) : null}
              {section.label}
            </h2>

            {groups.map((group) => (
              <div key={group.companyId}>
                {showCompanyGroups ? (
                  <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("companyGroup", { company: group.companyName })}
                  </h3>
                ) : null}
                {mode === "board" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {group.tasks.map((task) => (
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
                    {group.tasks.map((task) => (
                      <TaskRowItem
                        key={task.id}
                        task={task}
                        muted={section.muted}
                        pendingAcceptance={section.key === "toAccept"}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

function groupTasks(tasks: TaskRow[], grouped: boolean) {
  if (!grouped) {
    return [{ companyId: "all", companyName: "", tasks }];
  }

  const groups = new Map<string, { companyName: string; tasks: TaskRow[] }>();
  for (const task of tasks) {
    const current = groups.get(task.company_id) ?? {
      companyName: task.company_name,
      tasks: [],
    };
    current.tasks.push(task);
    groups.set(task.company_id, current);
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => a.companyName.localeCompare(b.companyName))
    .map(([companyId, group]) => ({ companyId, ...group }));
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
