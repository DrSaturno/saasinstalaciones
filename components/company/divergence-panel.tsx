import { getTranslations } from "next-intl/server";
import type { DivergenceReport } from "@/lib/domain/canonical-divergence";
import { isCutoverSafe } from "@/lib/domain/canonical-divergence";

/**
 * Estado de la unificación entre `sites` y el modelo canónico (R2-DB-04).
 *
 * El plan pide retirar la proyección legacy «sólo con divergencia cero
 * aceptada». Este panel es esa medición: mientras muestre algo distinto de
 * cero, migrar las lecturas haría que alguna pantalla pierda datos.
 */
export async function DivergencePanel({ report }: { report: DivergenceReport }) {
  const t = await getTranslations("LocationReview.divergence");
  const safe = isCutoverSafe(report);

  const rows = (
    [
      ["unlinked", report.counts.unlinked],
      ["missingLocation", report.counts.missingLocation],
      ["missingAssociation", report.counts.missingAssociation],
      ["fieldMismatch", report.counts.fieldMismatch],
    ] as const
  ).filter(([, count]) => count > 0);

  return (
    <section className="rounded-xl border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">{t("title")}</h2>
          <p className="mt-0.5 max-w-[70ch] text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <p className="font-mono text-sm">
          {t("ratio", { clean: report.cleanSites, total: report.totalSites })}
        </p>
      </div>

      {safe ? (
        <p className="mt-3 text-sm text-success">{t("safe")}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-warning">
            {t("blocked", { count: report.divergences.length })}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {rows.map(([kind, count]) => (
              <li key={kind}>
                <span className="font-mono">{count}</span> · {t(`kind.${kind}`)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
