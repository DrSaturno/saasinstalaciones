import { getFormatter, getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import {
  summarizeReliability,
  type ReliabilityEvent,
  type ReliabilityKind,
} from "@/lib/domain/reliability";
import { Card, CardContent } from "@/components/ui/card";

/** next-intl exige claves literales, así que el mapeo va explícito. */
const KIND_KEY: Record<ReliabilityKind, `kinds.${ReliabilityKind}`> = {
  order_accepted: "kinds.order_accepted",
  order_completed: "kinds.order_completed",
  cancel_in_notice: "kinds.cancel_in_notice",
  cancel_late: "kinds.cancel_late",
  cancel_justified: "kinds.cancel_justified",
  reschedule_accepted: "kinds.reschedule_accepted",
  reschedule_declined: "kinds.reschedule_declined",
  reschedule_no_response: "kinds.reschedule_no_response",
};

/**
 * Lo que el instalador ve sobre su propia confiabilidad.
 *
 * El requisito pide seis cosas de cada penalización: motivo, trabajo
 * relacionado, fecha, impacto, duración estimada y cómo recuperar el nivel.
 * Están las seis, y por eso esto no es un número suelto con una carita: un
 * puntaje que no se puede auditar es exactamente lo que genera desconfianza.
 *
 * Y dice explícitamente que hoy **no afecta el acceso al trabajo**. Está en
 * modo sombra (ADR-011), y ocultarlo sería dejar que la gente asuma lo peor.
 */
export async function ReliabilityPanel({
  events,
  orderNumbers,
  asOf,
}: {
  events: readonly ReliabilityEvent[];
  orderNumbers: ReadonlyMap<string, string>;
  asOf: string;
}) {
  const [t, format] = await Promise.all([
    getTranslations("Reliability"),
    getFormatter(),
  ]);
  const summary = summarizeReliability(events, asOf);

  const day = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("title")}</h2>

            {summary.hasEnoughHistory ? (
              <>
                <p className="mt-3 font-mono text-4xl font-semibold">
                  {summary.score}
                  <span className="ml-1 text-base text-muted-foreground">/100</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("basedOn", {
                    count: summary.sampleSize,
                    days: summary.windowDays,
                  })}
                </p>
              </>
            ) : (
              <p className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">
                {t("notEnough", { count: summary.sampleSize })}
              </p>
            )}

            <p className="mt-3 rounded-lg border border-primary/30 bg-primary-soft/30 p-3 text-xs leading-relaxed">
              {t("shadowNote")}
            </p>

            {summary.penalties.length > 0 ? (
              <section className="mt-5">
                <h3 className="text-sm font-medium">{t("penaltiesTitle")}</h3>
                <ul className="mt-2 grid gap-3">
                  {summary.penalties.map((penalty) => (
                    <li key={penalty.event.id} className="rounded-lg border bg-surface p-3">
                      <p className="text-sm font-medium">
                        {t(KIND_KEY[penalty.event.kind])}
                      </p>
                      <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        {penalty.event.orderId ? (
                          <div className="flex flex-wrap gap-x-2">
                            <dt>{t("relatedOrder")}</dt>
                            <dd className="font-mono">
                              {orderNumbers.get(penalty.event.orderId) ?? "—"}
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-x-2">
                          <dt>{t("when")}</dt>
                          <dd>{day(penalty.event.occurredAt)}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt>{t("impact")}</dt>
                          <dd className="font-mono">
                            {Math.round(penalty.effect)} {t("points")}
                          </dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt>{t("fadesOn")}</dt>
                          <dd>{day(penalty.fadesOn)}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
                  {t("howToRecover")}
                </p>
              </section>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">{t("noPenalties")}</p>
            )}

            <section className="mt-5">
              <h3 className="text-sm font-medium">{t("historyTitle")}</h3>
              <ul className="mt-2 grid gap-1">
                {(Object.keys(summary.counts) as ReliabilityKind[])
                  .filter((kind) => summary.counts[kind] > 0)
                  .map((kind) => (
                    <li
                      key={kind}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">{t(KIND_KEY[kind])}</span>
                      <span className="font-mono">{summary.counts[kind]}</span>
                    </li>
                  ))}
              </ul>
              {summary.sampleSize === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("noHistory")}</p>
              ) : null}
            </section>

            <p className="mt-4 text-xs text-muted-foreground">
              {t("formula", { version: summary.formulaVersion })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
