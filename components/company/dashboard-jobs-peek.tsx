"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ManagerBroadcast } from "@/lib/data/broadcasts";
import {
  DashboardPeekDialog,
  PEEK_LIMIT,
} from "@/components/company/dashboard-peek-dialog";

/**
 * Asomada a las búsquedas publicadas y cómo van de cupos.
 *
 * Lo que importa de un vistazo es si falta gente: por eso el contador de
 * aceptados sobre cupos va primero, y las postulaciones sin resolver se marcan
 * aparte — son la acción pendiente.
 */
export function DashboardJobsPeek({ broadcasts }: { broadcasts: ManagerBroadcast[] }) {
  const t = useTranslations("Dashboard");
  const visible = broadcasts.slice(0, PEEK_LIMIT);

  return (
    <DashboardPeekDialog
      label={t("quickActions.myJobs")}
      emptyLabel={t("peekJobsEmpty")}
      href="/broadcasts?filter=open"
      hrefLabel={t("peekOpenJobs")}
      count={broadcasts.length}
    >
      {visible.map((broadcast) => {
        const waiting = broadcast.applicants.filter((applicant) => applicant.status === "applied").length;
        return (
          <Link
            key={broadcast.id}
            href="/broadcasts?filter=open"
            className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{broadcast.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {broadcast.projectName} · {broadcast.zone}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {waiting > 0 ? (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t("peekWaiting", { count: waiting })}
                </span>
              ) : null}
              <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Users className="size-3" aria-hidden="true" />
                {broadcast.acceptedCount}/{broadcast.slots}
              </span>
            </div>
          </Link>
        );
      })}
    </DashboardPeekDialog>
  );
}
