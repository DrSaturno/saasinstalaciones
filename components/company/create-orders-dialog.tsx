"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createOrdersForProject } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Genera una orden por cada punto del proyecto que aún no tenga una. */
export function CreateOrdersDialog({
  projectId,
  siteCount,
}: {
  projectId: string;
  siteCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Instalación");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () => {
    startTransition(async () => {
      const res = await createOrdersForProject(projectId, title);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      if (res.created === 0) {
        toast.info(
          res.skipped > 0
            ? "Todos los puntos ya tienen una orden."
            : "No hay puntos para generar órdenes.",
        );
      } else {
        toast.success(
          `${res.created} órdenes creadas${res.skipped > 0 ? ` · ${res.skipped} puntos ya tenían` : ""}`,
        );
      }
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={siteCount === 0}>Generar órdenes</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar órdenes de trabajo</DialogTitle>
          <DialogDescription>
            Se crea una orden por cada punto del proyecto que todavía no tenga
            una. Los puntos que ya tienen orden se saltean.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Título de las órdenes</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Instalación de gráfica"
            />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            El proyecto tiene <span className="font-mono">{siteCount}</span> puntos.
          </div>
          <Button onClick={run} disabled={pending}>
            {pending ? "Generando…" : "Generar órdenes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
