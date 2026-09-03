import { getTranslations } from "next-intl/server";
import { Flame, Trophy } from "lucide-react";
import type { ReputationBadge, ReputationSummary } from "@/lib/data/reputation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BADGE_KEY: Record<ReputationBadge, `badges.${ReputationBadge}`> = {
  disponibilidad_inmediata: "badges.disponibilidad_inmediata",
  alta_dificultad: "badges.alta_dificultad",
  racha: "badges.racha",
  compromiso_sostenido: "badges.compromiso_sostenido",
};

/**
 * La reputación de un instalador, como la ve la empresa que lo evalúa.
 *
 * **Son totales que cruzan empresas, y ninguno dice de quién fue cada
 * trabajo.** Ésa es la única razón por la que se puede mostrar el historial de
 * alguien que trabajó para la competencia: lo que llega acá no tiene forma de
 * revelar cliente, dirección ni motivo. El detalle de esta misma persona, más
 * abajo en la ficha, sí queda acotado a la operación propia.
 *
 * **Informa, no ordena.** Este bloque nunca decide por la empresa: no filtra
 * candidatos ni los prioriza. Que un número empiece a decidir quién trabaja es
 * una decisión aparte, con su propio gate (`R8-GATE`).
 */
export async function InstallerReputationCard({
  summary,
}: {
  summary: ReputationSummary;
}) {
  const t = await getTranslations("Reputation");

  // Cumplimiento: la proporción de trabajos que terminó sin darse de baja.
  //
  // NO es el índice de confiabilidad, y por eso no se lo llama así: ese índice
  // tiene ventana, escalado y decaimiento propios, y vive en
  // `lib/domain/reliability.ts`. Reescribirlo acá para poder mostrarlo sería
  // tener dos fórmulas de lo mismo, que es exactamente el problema que este
  // punto ya evitó con el desglose. Esto es una razón simple sobre los mismos
  // totales que la función ya devuelve.
  const base = summary.completed + summary.faults;
  const compliance = base > 0 ? Math.round((summary.completed / base) * 100) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {summary.hasEnoughHistory && summary.score !== null ? (
            <p className="font-mono text-3xl font-semibold leading-none">
              {summary.score}
              <span className="text-base text-muted-foreground">/100</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("notEnoughForCompany")}
            </p>
          )}

          <span className="inline-flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm">
            <Flame className="size-4 text-warning" aria-hidden="true" />
            {t("streak", { count: summary.streak })}
          </span>
        </div>

        {summary.badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {summary.badges.map((badge) => (
              <Badge key={badge} variant="secondary">
                {t(BADGE_KEY[badge])}
              </Badge>
            ))}
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Indicator label={t("completed")} value={summary.completed} />
          <Indicator label={t("complex")} value={summary.complexCompleted} />
          <Indicator label={t("shortNotice")} value={summary.shortNoticeAccepted} />
          <Indicator
            label={t("compliance")}
            value={compliance === null ? "—" : `${compliance}%`}
          />
        </dl>

        <p className="text-xs text-muted-foreground">{t("companyNote")}</p>
      </CardContent>
    </Card>
  );
}

function Indicator({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-2xl">{value}</dd>
    </div>
  );
}
