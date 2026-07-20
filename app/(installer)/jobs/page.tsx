import { BriefcaseBusiness, MapPin } from "lucide-react";
import { JobCard } from "@/components/installer/job-card";
import { fetchInstallerJobs } from "@/lib/data/broadcasts";
import { createClient } from "@/lib/supabase/server";

export default async function InstallerJobsPage() {
  const supabase = await createClient();
  const board = await fetchInstallerJobs(supabase);
  const openJobs = board.jobs.filter((job) => job.status === "open");
  const history = board.jobs.filter(
    (job) => job.status === "closed" && job.applicationStatus,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl bg-brand-purple px-5 py-6 text-white sm:px-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/60">Radar de trabajo</p>
        <h1 className="mt-2 text-2xl font-semibold">Bolsa de tu zona</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {board.zones.length ? board.zones.map((zone) => (
            <span key={zone} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-mono text-xs">
              <MapPin className="size-3" /> {zone}
            </span>
          )) : <span className="text-sm text-white/70">Configurá tus zonas en el perfil.</span>}
        </div>
      </div>

      {!board.available ? (
        <div className="mt-4 rounded-xl border border-warning/30 bg-cream/40 p-4 text-sm">
          Tu perfil figura como no disponible. Podés ver las búsquedas, pero activá tu disponibilidad en Perfil para recibir avisos.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-medium">Disponibles ahora</h2>
        <span className="font-mono text-xs text-muted-foreground">{openJobs.length} oportunidades</span>
      </div>
      {openJobs.length ? (
        <div className="mt-3 grid gap-3">
          {openJobs.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      ) : (
        <div className="mt-3 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center">
          <BriefcaseBusiness className="mb-3 size-5 text-muted-foreground" />
          <p className="text-sm font-medium">No hay búsquedas abiertas</p>
          <p className="mt-1 text-xs text-muted-foreground">Te avisaremos cuando aparezca trabajo en tus zonas.</p>
        </div>
      )}

      {history.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Historial de postulaciones</h2>
          <div className="grid gap-3">{history.map((job) => <JobCard key={job.id} job={job} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
