"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  PROJECT_HEALTH_ORDER,
  overallProgress,
  projectHealth,
  type ProjectHealth,
} from "@/lib/domain/project-health";
import { ViewToggle, useViewMode } from "@/components/shared/view-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectStatus } from "@/types/database";

export type ProjectCard = {
  id: string;
  name: string;
  clientName: string;
  status: ProjectStatus;
  endsAt: string | null;
  archivedAt: string | null;
  total: number;
  done: number;
};

const HEALTH_BADGE: Record<ProjectHealth, string> = {
  active: "bg-primary-soft text-foreground",
  delayed: "bg-destructive/10 text-destructive",
  done: "bg-emerald-100 text-emerald-800",
  paused: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

/** Listado de proyectos con métricas, filtro por estado y vista tarjetas/tabla. */
export function ProjectsView({ projects }: { projects: ProjectCard[] }) {
  const t = useTranslations("Projects");
  const common = useTranslations("Common");
  const [mode, setMode] = useViewMode("view:projects", "board");
  const [filter, setFilter] = useState<ProjectHealth | "all">("all");

  const withHealth = useMemo(
    () => projects.map((project) => ({ ...project, health: projectHealth(project) })),
    [projects],
  );

  // Los archivados salen del listado corriente: no entran en "Todos" ni en las
  // métricas de avance. Se ven solo desde su propio filtro.
  const current = useMemo(
    () => withHealth.filter((project) => project.health !== "archived"),
    [withHealth],
  );
  const archived = useMemo(
    () => withHealth.filter((project) => project.health === "archived"),
    [withHealth],
  );

  const counts = useMemo(() => {
    const base = Object.fromEntries(
      PROJECT_HEALTH_ORDER.map((health) => [health, 0]),
    ) as Record<ProjectHealth, number>;
    for (const project of current) base[project.health]++;
    return base;
  }, [current]);

  const visible = useMemo(() => {
    if (filter === "all") return current;
    if (filter === "archived") return archived;
    return current.filter((project) => project.health === filter);
  }, [current, archived, filter]);

  const percent = (project: ProjectCard) =>
    project.total ? Math.round((project.done / project.total) * 100) : 0;

  const metrics: { key: string; label: string; value: string }[] = [
    { key: "total", label: t("metricTotal"), value: String(current.length) },
    { key: "active", label: t("metricActive"), value: String(counts.active) },
    { key: "delayed", label: t("metricDelayed"), value: String(counts.delayed) },
    { key: "done", label: t("metricDone"), value: String(counts.done) },
    { key: "archived", label: t("metricArchived"), value: String(archived.length) },
    { key: "progress", label: t("metricProgress"), value: `${overallProgress(current)}%` },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.key} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-1 font-mono text-2xl">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label={t("filterAll")}
            count={current.length}
          />
          {PROJECT_HEALTH_ORDER.filter((health) => counts[health] > 0).map((health) => (
            <FilterChip
              key={health}
              active={filter === health}
              onClick={() => setFilter(health)}
              label={t(`health.${health}`)}
              count={counts[health]}
            />
          ))}
          {archived.length > 0 ? (
            <FilterChip
              active={filter === "archived"}
              onClick={() => setFilter("archived")}
              label={t("health.archived")}
              count={archived.length}
            />
          ) : null}
        </div>
        <ViewToggle
          value={mode}
          onChange={setMode}
          labels={{ list: common("viewList"), board: common("viewBoard") }}
        />
      </div>

      {visible.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noneForFilter")}</p>
          </CardContent>
        </Card>
      ) : mode === "board" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card interactive className="h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">{project.name}</h2>
                    <Badge variant="secondary" className={`shrink-0 ${HEALTH_BADGE[project.health]}`}>
                      {t(`health.${project.health}`)}
                    </Badge>
                  </div>
                  {project.clientName ? (
                    <p className="mt-1 text-sm text-muted-foreground">{project.clientName}</p>
                  ) : null}
                  <div className="mt-6">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-2xl">{project.total}</span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {percent(project)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("progress", { total: project.total, done: project.done })}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${percent(project)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nameColumn")}</TableHead>
                <TableHead>{t("clientColumn")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
                <TableHead className="text-right">{t("sitesColumn")}</TableHead>
                <TableHead className="text-right">{t("progressColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {project.clientName || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={HEALTH_BADGE[project.health]}>
                      {t(`health.${project.health}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{project.total}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {percent(project)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-muted"
      }`}
    >
      {label}
      <span className="ml-2 font-mono text-xs opacity-70">{count}</span>
    </button>
  );
}
