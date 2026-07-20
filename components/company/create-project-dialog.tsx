"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createProject, type ActionState } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initial: ActionState = { error: null };

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProject, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      toast.success("Proyecto creado");
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo proyecto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
          <DialogDescription>
            Después vas a poder importar sus puntos de instalación.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre del proyecto</Label>
            <Input
              id="name"
              name="name"
              placeholder="Refacción Estaciones Shell 2026"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientName">Cliente</Label>
            <Input id="clientName" name="clientName" placeholder="Shell Argentina" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startsAt">Inicio</Label>
              <Input id="startsAt" name="startsAt" type="date" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endsAt">Fin estimado</Label>
              <Input id="endsAt" name="endsAt" type="date" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? "Creando…" : "Crear proyecto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
