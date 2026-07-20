"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createBroadcast,
  type BroadcastActionState,
} from "@/lib/actions/broadcasts";
import type { ProjectOption } from "@/lib/data/broadcasts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: BroadcastActionState = { error: null };

export function CreateBroadcastDialog({
  projects,
  zones,
}: {
  projects: ProjectOption[];
  zones: string[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: BroadcastActionState, formData: FormData) => {
      const next = await createBroadcast(previous, formData);
      if (next.ok) {
        setOpen(false);
        toast.success("Búsqueda publicada");
        router.refresh();
      }
      return next;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!projects.length}>
          <Plus /> Nueva búsqueda
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publicar necesidad</DialogTitle>
          <DialogDescription>
            Los instaladores disponibles cuya zona coincida recibirán el aviso.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="broadcast-project">Proyecto</Label>
            <select
              id="broadcast-project"
              name="projectId"
              required
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="" disabled>Elegí un proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-zone">Zona</Label>
            <Input
              id="broadcast-zone"
              name="zone"
              list="company-zones"
              placeholder="AR-CBA"
              autoCapitalize="characters"
              required
            />
            <datalist id="company-zones">
              {zones.map((zone) => <option key={zone} value={zone} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="broadcast-title">Título</Label>
              <Input id="broadcast-title" name="title" maxLength={120} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-slots">Cupos</Label>
              <Input id="broadcast-slots" name="slots" type="number" min={1} max={50} defaultValue={1} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-description">Detalle</Label>
            <Textarea id="broadcast-description" name="description" maxLength={1200} rows={4} placeholder="Alcance, fechas estimadas y requisitos…" />
          </div>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? "Publicando…" : "Publicar búsqueda"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
