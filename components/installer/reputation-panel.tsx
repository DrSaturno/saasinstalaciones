import { getFormatter, getTranslations } from "next-intl/server";
import { Flame, Trophy } from "lucide-react";
import type {
  ReputationBadge,
  ReputationContribution,
  ReputationSummary,
} from "@/lib/data/reputation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** next-intl exige claves literales, así que el mapeo va explícito. */
const BADGE_KEY: Record<ReputationBadge, `badges.${ReputationBadge}`> = {
  disponibilidad_inmediata: "badges.disponibilidad_inmediata",
  alta_dificultad: "badges.alta_dificultad",
  racha: "badges.racha",
  compromiso_sostenido: "badges.compromiso_sostenido",
};

/**
 * Lo que el instalador ve sobre su propia reputación.
 *
 * **No es el índice de confiabilidad, y la pantalla tiene que decirlo.** Los
 * dos números viven en esta misma página y responden preguntas distintas:
 * confiabilidad arranca en 100 y las faltas la bajan —¿va a cumplir?—;
 * reputación arranca en 0 y la trayectoria la sube —¿qué hizo hasta acá?
 * Sin esa aclaración, dos números entre 0 y 100 uno al lado del otro se leen
 * como si midieran lo mismo y uno estuviera mal.
 *
 * **El desglose incluye los hechos que aportaron cero.** Es el mismo criterio
 * que en confiabilidad: la persona tiene que poder comprobar que aceptar un
 * trabajo con margen no le restó nada, y eso sólo se comprueba viéndolo.
 */
export async function ReputationPanel({
  summary,
  contributions,
}: {
  summary: ReputationSummary;
  contributions: readonly ReputationContribution[];
}) {
  const [t, format] = await Promise.all([
    getTranslations("Reputation"),
    getFormatter(),
  ]);

  const label = (item: ReputationContribution) => {
    if (item.kind === "job_completed") {
      return item.complex ? t("events.complexCompleted") : t("events.completed");
    }
    if (item.kind === "job_accepted") {
      return item.shortNotice
        ? t("events.shortNotice")
        : t("events.accepted");
    }
    if (item.kind === "incident_resolved") return t("events.incident");
    return t("events.fault");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Trophy className="size-4 text-primary" />
              {t("title")}
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <div className="text-right">
            {summary.hasEnoughHistory && summary.score !== null ? (
              <>
                <p className="font-mono text-4xl font-semibold leading-none">
                  {summary.score}
                  <span className="text-lg text-muted-foreground">/100</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("version", { version: summary.ruleVersion })}
                </p>
              </>
            ) : (
              <p className="max-w-52 text-sm text-muted-foreground">
                {t("notEnough", { count: summary.sampleSize })}
              </p>
            )}
          </div>
        </div>

        {/* La racha, que es lo que el pedido quiere que se vea de un vistazo. */}
        <div className="mt-5 flex items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
          <Flame className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              {t("streak", { count: summary.streak })}
            </p>
            <p className="text-xs text-muted-foreground">{t("streakHelp")}</p>
          </div>
        </div>

        {summary.badges.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.badges.map((badge) => (
              <Badge key={badge} variant="secondary">
                {t(BADGE_KEY[badge])}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label={t("completed")} value={summary.completed} />
          <Metric label={t("complex")} value={summary.complexCompleted} />
          <Metric label={t("shortNotice")} value={summary.shortNoticeAccepted} />
          <Metric label={t("incidents")} value={summary.incidentsResolved} />
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium">{t("breakdown")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("breakdownHelp")}
          </p>

          {contributions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="mt-3 divide-y rounded-xl border">
              {contributions.map((item, index) => (
                <li
                  key={`${item.kind}:${item.occurredAt}:${index}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="text-sm">{label(item)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.occurredAt
                        ? format.dateTime(new Date(item.occurredAt), {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                      {item.conditions.length > 0
                        ? ` · ${item.conditions.join(", ")}`
                        : ""}
                      {item.kind === "job_accepted" &&
                      item.leadTimeBusinessDays !== null
                        ? ` · ${t("leadTime", { days: item.leadTimeBusinessDays })}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm ${
                      item.effect > 0
                        ? "text-success"
                        : item.effect < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {item.effect > 0 ? "+" : ""}
                    {item.effect.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">{t("vsReliability")}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
    </div>
  );
}
