"use client";

import { useState, useTransition } from "react";
import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formalizeProjectFromBroadcast } from "@/lib/actions/broadcasts";
import type { CoordinatorOption } from "@/lib/data/broadcasts";
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

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

/**
 * Último paso del flujo: la cotización ya se aceptó y el trabajo se confirmó
 * con el cliente, así que ahora sí se crea el proyecto.
 *
 * El coordinador es obligatorio ACÁ y en ningún otro lado. Cuando no hay
 * ninguno cargado no se muestra un selector vacío: se dice qué falta y por
 * qué, que es lo que el spec pide ("informar claramente al usuario").
 */
export function FormalizeProjectDialog({
  broadcastId,
  installerId,
  installerName,
  defaultName,
  coordinators,
}: {
  broadcastId: string;
  installerId: string;
  installerName: string;
  defaultName: string;
  coordinators: CoordinatorOption[];
}) {
  const t = useTranslations("FormalizeProject");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [coordinatorId, setCoordinatorId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const result = await formalizeProjectFromBroadcast({
        broadcastId,
        installerId,
        coordinatorId,
        name,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("created"));
      setOpen(false);
      if (result.projectId) router.push(`/projects/${result.projectId}`);
      else router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FolderPlus className="size-3.5" aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: installerName })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`formalize-name-${broadcastId}`}>{t("projectName")}</Label>
            <Input
              id={`formalize-name-${broadcastId}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              disabled={pending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`formalize-coordinator-${broadcastId}`}>
              {t("coordinator")}
            </Label>
            {coordinators.length ? (
              <>
                <select
                  id={`formalize-coordinator-${broadcastId}`}
                  value={coordinatorId}
                  onChange={(event) => setCoordinatorId(event.target.value)}
                  className={selectClass}
                  disabled={pending}
                >
                  <option value="">{t("chooseCoordinator")}</option>
                  {coordinators.map((coordinator) => (
                    <option key={coordinator.id} value={coordinator.id}>
                      {coordinator.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t("coordinatorHelp")}</p>
              </>
            ) : (
              <p className="rounded-lg border border-warning/40 bg-cream/30 p-3 text-xs leading-relaxed">
                {t("noCoordinators")}
              </p>
            )}
          </div>

          <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("reuseNote")}
          </p>

          <Button
            onClick={submit}
            disabled={pending || !coordinatorId || !name.trim()}
          >
            {pending ? t("creating") : t("submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
