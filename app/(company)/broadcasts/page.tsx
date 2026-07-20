import { RadioTower } from "lucide-react";
import { CreateBroadcastDialog } from "@/components/company/create-broadcast-dialog";
import { BroadcastCard } from "@/components/company/broadcast-card";
import { createClient } from "@/lib/supabase/server";
import { fetchBroadcastBoard } from "@/lib/data/broadcasts";

export default async function BroadcastsPage() {
  const supabase = await createClient();
  const board = await fetchBroadcastBoard(supabase);
  const openCount = board.broadcasts.filter((item) => item.status === "open").length;
  const pendingCount = board.broadcasts.reduce(
    (total, item) =>
      total + item.applicants.filter((applicant) => applicant.status === "applied").length,
    0,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Despacho por zona
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Bolsa de instaladores</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Publicá necesidades por proyecto, revisá candidatos y asigná órdenes en una
            sola operación.
          </p>
        </div>
        <CreateBroadcastDialog projects={board.projects} zones={board.zones} />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:w-fit sm:grid-cols-[160px_160px]">
        <div className="bg-card p-4">
          <p className="font-mono text-2xl font-semibold">{openCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">búsquedas abiertas</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-2xl font-semibold">{pendingCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">por revisar</p>
        </div>
      </div>

      {board.broadcasts.length ? (
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
          {board.broadcasts.map((broadcast) => (
            <BroadcastCard key={broadcast.id} broadcast={broadcast} />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 text-center">
          <span className="mb-4 rounded-full bg-accent p-3 text-primary">
            <RadioTower className="size-5" />
          </span>
          <h2 className="font-medium">Todavía no hay búsquedas</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Creá la primera para avisar a los instaladores disponibles en una zona.
          </p>
        </div>
      )}
    </div>
  );
}
