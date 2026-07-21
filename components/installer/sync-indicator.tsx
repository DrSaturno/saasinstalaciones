"use client";

import { useSync } from "@/lib/offline/use-sync";
import { useTranslations } from "next-intl";

/**
 * Barra fina que muestra el estado de conexión y cuántos avances quedan por
 * sincronizar. Sólo se muestra cuando hay algo que comunicar (offline o cola
 * pendiente), para no molestar en el caso normal.
 */
export function SyncIndicator() {
  const t = useTranslations("SyncIndicator");
  const { online, pending, syncing } = useSync();

  if (online && pending === 0) return null;

  const bg = online ? "bg-[var(--warning)]/15" : "bg-muted";
  const dot = online ? "bg-[var(--warning)]" : "bg-muted-foreground";

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs ${bg}`}
      role="status"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {!online ? (
        <span>
          {t("offline")}
          {pending > 0
            ? ` · ${t("notSent", { count: pending })}`
            : ` · ${t("keepWorking")}`}
        </span>
      ) : syncing ? (
        <span>{t("syncing")}</span>
      ) : (
        <span>{t("pending", { count: pending })}</span>
      )}
    </div>
  );
}
