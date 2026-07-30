"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { acceptApplication, rejectApplication } from "@/lib/actions/broadcasts";
import type { ManagerBroadcast } from "@/lib/data/broadcasts";
import {
  DashboardPeekDialog,
  PEEK_LIMIT,
} from "@/components/company/dashboard-peek-dialog";
import { Button } from "@/components/ui/button";

type PendingApplication = {
  broadcastId: string;
  broadcastTitle: string;
  installerId: string;
  name: string;
  zones: string[];
  ratingAvg: number;
  ratingCount: number;
};

/**
 * Postulaciones sin resolver, con la decisión a un click.
 *
 * Aceptar acá suma la persona al equipo pero **no** le asigna órdenes: elegir
 * cuáles es una decisión con más contexto y vive en el módulo de la bolsa. Esto
 * resuelve el caso frecuente —"sí, que se sume"— sin sacar al gerente del
 * tablero.
 */
export function DashboardApplicationsPeek({ broadcasts }: { broadcasts: ManagerBroadcast[] }) {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const applications: PendingApplication[] = broadcasts.flatMap((broadcast) =>
    broadcast.applicants
      .filter((applicant) => applicant.status === "applied")
      .map((applicant) => ({
        broadcastId: broadcast.id,
        broadcastTitle: broadcast.title,
        installerId: applicant.installerId,
        name: applicant.name,
        zones: applicant.zones,
        ratingAvg: applicant.ratingAvg,
        ratingCount: applicant.ratingCount,
      })),
  );

  const resolve = (application: PendingApplication, accept: boolean) => {
    startTransition(async () => {
      const result = accept
        ? await acceptApplication({
            broadcastId: application.broadcastId,
            installerId: application.installerId,
            orderIds: [],
          })
        : await rejectApplication(application.broadcastId, application.installerId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("quickActionDone"));
      router.refresh();
    });
  };

  return (
    <DashboardPeekDialog
      label={t("quickActions.applications")}
      emptyLabel={t("peekApplicationsEmpty")}
      href="/broadcasts?filter=applications"
      hrefLabel={t("peekOpenApplications")}
      count={applications.length}
    >
      {applications.slice(0, PEEK_LIMIT).map((application) => (
        <div
          key={`${application.broadcastId}:${application.installerId}`}
          className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{application.name}</p>
              {application.ratingCount > 0 ? (
                <span className="flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground">
                  <Star className="size-3 fill-current" aria-hidden="true" />
                  {application.ratingAvg.toFixed(1)}
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {application.broadcastTitle}
              {application.zones.length ? ` · ${application.zones.join(", ")}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => resolve(application, false)}
            >
              {t("peekReject")}
            </Button>
            <Button size="sm" disabled={pending} onClick={() => resolve(application, true)}>
              {t("peekAccept")}
            </Button>
          </div>
        </div>
      ))}
    </DashboardPeekDialog>
  );
}
