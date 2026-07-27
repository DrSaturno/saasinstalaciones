"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PROJECT_STATUS } from "@/lib/domain/status";
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
  total: number;
  done: number;
};

/** Listado de proyectos en tarjetas o tabla. */
export function ProjectsView({ projects }: { projects: ProjectCard[] }) {
  const t = useTranslations("Projects");
  const statusT = useTranslations("Status");
  const common = useTranslations("Common");
  const [mode, setMode] = useViewMode("view:projects", "board");

  const percent = (project: ProjectCard) =>
    project.total ? Math.round((project.done / project.total) * 100) : 0;

  return (
    <>
      <div className="mt-6 flex justify-end">
        <ViewToggle
          value={mode}
          onChange={setMode}
          labels={{ list: common("viewList"), board: common("viewBoard") }}
        />
      </div>

      {mode === "board" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card interactive className="h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">{project.name}</h2>
                    <Badge variant="secondary" className="shrink-0">
                      {statusT(PROJECT_STATUS[project.status].key)}
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
              {projects.map((project) => (
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
                    <Badge variant="secondary">
                      {statusT(PROJECT_STATUS[project.status].key)}
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
