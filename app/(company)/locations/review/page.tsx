import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLocationIssues } from "@/lib/data/location-issues";
import { fetchDivergenceReport } from "@/lib/data/canonical-divergence";
import { LocationIssueCard } from "@/components/company/location-issue-card";
import { DivergencePanel } from "@/components/company/divergence-panel";

/**
 * Cola de revisión del backfill canónico (R2-UI-03).
 *
 * El backfill de `20260805000003` es deliberadamente conservador: si no puede
 * decidir con la referencia externa, no fusiona por nombre ni por dirección y
 * deja la fila acá. Sin esta pantalla esas filas existían pero no había forma
 * de verlas desde la app.
 */
export default async function LocationReviewPage() {
  const [t, supabase] = await Promise.all([
    getTranslations("LocationReview"),
    createClient(),
  ]);
  const [pending, closed, divergence] = await Promise.all([
    fetchLocationIssues(supabase, { status: "pending" }),
    fetchLocationIssues(supabase, { status: "resolved" }),
    fetchDivergenceReport(supabase),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1480px] space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-[70ch] text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <DivergencePanel report={divergence} />

      {pending.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-6">
          <p className="font-medium">{t("empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("pendingCount", { count: pending.length })}
          </h2>
          {pending.map((issue) => (
            <LocationIssueCard key={issue.id} issue={issue} />
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("closedCount", { count: closed.length })}
          </h2>
          <ul className="divide-y rounded-xl border">
            {closed.map((issue) => (
              <li key={issue.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{t(`code.${issue.code}`)}</span>
                  {issue.externalRef && (
                    <span className="font-mono text-muted-foreground">
                      {issue.externalRef}
                    </span>
                  )}
                </div>
                {issue.resolutionNote && (
                  <p className="mt-1 text-muted-foreground">
                    {issue.resolutionNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
