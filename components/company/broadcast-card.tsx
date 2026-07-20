"use client";

import { useState, useTransition } from "react";
import { CalendarDays, MapPin, MoreHorizontal, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  closeBroadcast,
  rejectApplication,
  updateBroadcast,
} from "@/lib/actions/broadcasts";
import type { ManagerBroadcast } from "@/lib/data/broadcasts";
import { AcceptApplicationDialog } from "@/components/company/accept-application-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const APPLICATION_LABEL = {
  applied: "Pendiente",
  accepted: "Aceptado",
  rejected: "No seleccionado",
} as const;

export function BroadcastCard({ broadcast }: { broadcast: ManagerBroadcast }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const applicants = broadcast.applicants.filter((item) => item.status !== "rejected");

  const close = () => {
    startTransition(async () => {
      const result = await closeBroadcast(broadcast.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Búsqueda cerrada");
      router.refresh();
    });
  };

  const save = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateBroadcast({
        broadcastId: broadcast.id,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        slots: Number(formData.get("slots")),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditOpen(false);
      toast.success("Búsqueda actualizada");
      router.refresh();
    });
  };

  return (
    <Card className={broadcast.status === "closed" ? "opacity-75" : ""}>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Badge variant={broadcast.status === "open" ? "default" : "secondary"}>
            {broadcast.status === "open" ? "Abierta" : "Cerrada"}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">{broadcast.zone}</span>
        </div>
        <CardTitle className="mt-2 text-lg">{broadcast.title}</CardTitle>
        {broadcast.status === "open" ? (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Opciones de búsqueda">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>Editar</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={pending} onSelect={close}>
                  Cerrar búsqueda
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {broadcast.description ? <p className="text-sm leading-6 text-muted-foreground">{broadcast.description}</p> : null}
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-3 text-xs">
          <span className="flex min-w-0 items-center gap-1.5"><MapPin className="size-3.5 text-primary" /><span className="truncate">{broadcast.projectName}</span></span>
          <span className="flex items-center gap-1.5"><Users className="size-3.5 text-primary" />{broadcast.acceptedCount}/{broadcast.slots} cupos</span>
          <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-primary" />{new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(broadcast.createdAt))}</span>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Candidatos</h3>
            <span className="font-mono text-xs text-muted-foreground">{applicants.length}</span>
          </div>
          {applicants.length ? (
            <div className="divide-y rounded-lg border">
              {applicants.map((applicant) => (
                <ApplicantRow key={applicant.installerId} broadcast={broadcast} applicant={applicant} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Sin postulaciones todavía.</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>{broadcast.applicants.filter((item) => item.status === "rejected").length} descartadas</span>
        <span>{broadcast.availableOrders.length} órdenes disponibles</span>
      </CardFooter>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar búsqueda</DialogTitle>
            <DialogDescription>La zona y el proyecto no cambian después de publicar.</DialogDescription>
          </DialogHeader>
          <form action={save} className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor={`title-${broadcast.id}`}>Título</Label><Input id={`title-${broadcast.id}`} name="title" defaultValue={broadcast.title} maxLength={120} required /></div>
            <div className="grid gap-2"><Label htmlFor={`slots-${broadcast.id}`}>Cupos</Label><Input id={`slots-${broadcast.id}`} name="slots" type="number" min={Math.max(1, broadcast.acceptedCount)} max={50} defaultValue={broadcast.slots} required /></div>
            <div className="grid gap-2"><Label htmlFor={`description-${broadcast.id}`}>Detalle</Label><Textarea id={`description-${broadcast.id}`} name="description" defaultValue={broadcast.description} maxLength={1200} rows={4} /></div>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ApplicantRow({
  broadcast,
  applicant,
}: {
  broadcast: ManagerBroadcast;
  applicant: ManagerBroadcast["applicants"][number];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const reject = () => startTransition(async () => {
    const result = await rejectApplication(broadcast.id, applicant.installerId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Postulación descartada");
    router.refresh();
  });

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{applicant.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="text-warning">★</span> {applicant.ratingCount ? applicant.ratingAvg.toFixed(1) : "Nuevo"} · {applicant.ratingCount} reseñas
          </p>
        </div>
        <Badge variant={applicant.status === "accepted" ? "default" : "outline"}>{APPLICATION_LABEL[applicant.status]}</Badge>
      </div>
      {applicant.message ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">“{applicant.message}”</p> : null}
      {applicant.status === "applied" && broadcast.status === "open" ? (
        <div className="mt-3 flex gap-2">
          <AcceptApplicationDialog broadcastId={broadcast.id} installerId={applicant.installerId} installerName={applicant.name} orders={broadcast.availableOrders} />
          <Button size="sm" variant="ghost" disabled={pending} onClick={reject}>Descartar</Button>
        </div>
      ) : null}
    </div>
  );
}
