"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createBroadcast,
  type BroadcastActionState,
} from "@/lib/actions/broadcasts";
import type { ClientOption, ProjectOption } from "@/lib/data/broadcasts";
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

/** Valor del `<select>` de proyecto cuando la convocatoria nace sin uno. */
const SIN_PROYECTO = "__sin_proyecto__";

export function CreateBroadcastDialog({
  projects,
  clients,
  zones,
  canManageFinance,
  trigger,
}: {
  projects: ProjectOption[];
  clients: ClientOption[];
  zones: string[];
  canManageFinance: boolean;
  /** Permite reusar el diálogo desde los accesos rápidos del inicio. */
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("CreateBroadcast");
  const [open, setOpen] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [origin, setOrigin] = useState("");
  const router = useRouter();
  const withoutProject = origin === SIN_PROYECTO;
  const [state, action, pending] = useActionState(
    async (previous: BroadcastActionState, formData: FormData) => {
      const next = await createBroadcast(previous, formData);
      if (next.ok) {
        setOpen(false);
        toast.success(t("published"));
        router.refresh();
      }
      return next;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          // Alcanza con tener clientes: publicar sin proyecto es justamente
          // para cuando todavía no hay ninguno.
          <Button disabled={!projects.length && !clients.length}>
            <Plus /> {t("trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="broadcast-project">{t("project")}</Label>
            <select
              id="broadcast-project"
              // Sin `name`: lo que se manda al servidor lo deciden los hidden
              // de abajo, porque el centinela "sin proyecto" no es un id.
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              required
              className="h-9 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="" disabled>{t("chooseProject")}</option>
              <option value={SIN_PROYECTO}>{t("withoutProject")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <input
              type="hidden"
              name="projectId"
              value={withoutProject ? "" : origin}
            />
            {withoutProject ? (
              <p className="text-xs text-muted-foreground">{t("withoutProjectHelp")}</p>
            ) : null}
          </div>

          {/* Sin proyecto no hay de dónde heredar el cliente: se informa acá,
              y sin él la oportunidad no se podría formalizar después. */}
          {withoutProject ? (
            <div className="grid gap-2">
              <Label htmlFor="broadcast-client">{t("client")}</Label>
              <select
                id="broadcast-client"
                name="clientId"
                required
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="" disabled>{t("chooseClient")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
              {clients.length === 0 ? (
                <p className="text-xs text-warning">{t("noClients")}</p>
              ) : null}
            </div>
          ) : (
            <input type="hidden" name="clientId" value="" />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="broadcast-date">{t("scheduledDate")}</Label><Input id="broadcast-date" name="scheduledDate" type="date" /></div>
            <div className="grid gap-2"><Label htmlFor="broadcast-end-date">{t("scheduledEndDate")}</Label><Input id="broadcast-end-date" name="scheduledEndDate" type="date" /></div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-zone">{t("zone")}</Label>
            <Input
              id="broadcast-zone"
              name="zone"
              list="company-zones"
              placeholder={t("zonePlaceholder")}
              required
            />
            <datalist id="company-zones">
              {zones.map((zone) => <option key={zone} value={zone} />)}
            </datalist>
          </div>
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("coordinatesHelp")}</p>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-lat">{t("latitude")}</Label>
              <Input id="broadcast-lat" name="lat" type="number" step="any" min="-90" max="90" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-lng">{t("longitude")}</Label>
              <Input id="broadcast-lng" name="lng" type="number" step="any" min="-180" max="180" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-requirements">{t("requirements")}</Label>
            <Textarea id="broadcast-requirements" name="requirements" maxLength={1500} rows={3} placeholder={t("requirementsPlaceholder")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-logistics">{t("logistics")}</Label>
            <Textarea id="broadcast-logistics" name="logisticsNotes" maxLength={1500} rows={3} placeholder={t("logisticsPlaceholder")} />
          </div>
          {canManageFinance ? (
            <div className="rounded-xl border p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="payVisible" checked={showPay} onChange={(event) => setShowPay(event.target.checked)} className="accent-primary" />
                {t("showPay")}
              </label>
              {showPay ? <div className="mt-3 grid gap-2"><Label htmlFor="broadcast-pay">{t("payAmount")}</Label><Input id="broadcast-pay" name="payAmount" type="number" min="0" step="0.01" required /></div> : <input type="hidden" name="payAmount" value="" />}
            </div>
          ) : null}
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="broadcast-title">{t("searchTitle")}</Label>
              <Input id="broadcast-title" name="title" maxLength={120} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-slots">{t("slots")}</Label>
              <Input id="broadcast-slots" name="slots" type="number" min={1} max={50} defaultValue={1} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-description">{t("detail")}</Label>
            <Textarea id="broadcast-description" name="description" maxLength={1200} rows={4} placeholder={t("detailPlaceholder")} />
          </div>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? t("publishing") : t("submit")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
