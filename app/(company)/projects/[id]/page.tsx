import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllSites } from "@/lib/data/sites";
import { SitesTable } from "@/components/company/sites-table";
import { ImportSitesDialog } from "@/components/company/import-sites-dialog";
import { PROJECT_STATUS } from "@/lib/domain/status";
import { Badge } from "@/components/ui/badge";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_name, description, status, starts_at, ends_at")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const sites = await fetchAllSites(supabase, id);
  const done = sites.filter((s) => s.status === "finalizada").length;
  const pct = sites.length ? Math.round((done / sites.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/projects"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Proyectos
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant="secondary">
              {PROJECT_STATUS[project.status].label}
            </Badge>
          </div>
          {project.client_name && (
            <p className="mt-1 text-muted-foreground">{project.client_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-2xl">{pct}%</p>
            <p className="text-xs text-muted-foreground">
              {done} de {sites.length} finalizados
            </p>
          </div>
          <ImportSitesDialog projectId={project.id} />
        </div>
      </div>

      <div className="mt-8">
        <SitesTable sites={sites} />
      </div>
    </div>
  );
}
