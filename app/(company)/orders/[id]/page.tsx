import Link from "next/link";
import { notFound } from "next/navigation";
import { Images, MessageSquareText, TriangleAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveRoster } from "@/lib/data/orders";
import { fetchOrderEvidence } from "@/lib/data/order-evidence";
import { OrderActions } from "@/components/company/order-actions";
import { OrderIncidents } from "@/components/company/order-incidents";
import { CancellationReview } from "@/components/company/cancellation-review";
import { SurveyReview } from "@/components/company/survey-review";
import {
  fetchPrerequisiteState,
  fetchSurveyDecisionAuthority,
  fetchSurveyState,
} from "@/lib/data/surveys";
import { PrerequisiteNotice } from "@/components/shared/prerequisite-notice";
import { fetchPendingCancellation } from "@/lib/data/cancellations";
import type { CancellationReason } from "@/lib/domain/cancellation-reasons";

/** next-intl exige claves literales, así que el mapeo va explícito. */
const REASON_KEY: Record<CancellationReason, `reasons.${CancellationReason}`> = {
  personal_emergency: "reasons.personal_emergency",
  health: "reasons.health",
  work_conditions: "reasons.work_conditions",
  schedule_conflict: "reasons.schedule_conflict",
  other: "reasons.other",
};
import { OrderEvidencePanel } from "@/components/shared/order-evidence-panel";
import { OrderEvidenceCompose } from "@/components/shared/order-evidence-compose";
import { EditOrderDialog } from "@/components/company/edit-order-dialog";
import { OrderPdfButton } from "@/components/shared/order-pdf-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusStepper } from "@/components/shared/status-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ORDER_EVIDENCE_KINDS, type EvidenceKind } from "@/lib/domain/order-evidence";
import type { OrderStatus } from "@/types/database";
import { canOperateCompany, getCurrentUser } from "@/lib/auth";
import { BackLink } from "@/components/shared/back-link";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { id } = await params;
  const [{ q, kind: kindParam }, t, createOrderT, cancelT, format, user] =
    await Promise.all([
      searchParams,
      getTranslations("OrderDetail"),
      getTranslations("CreateOrder"),
      getTranslations("RequestCancellation"),
      getFormatter(),
      getCurrentUser(),
    ]);
  const evidenceQuery = q ?? "";
  const evidenceKind: EvidenceKind | null = ORDER_EVIDENCE_KINDS.includes(
    kindParam as EvidenceKind,
  )
    ? (kindParam as EvidenceKind)
    : null;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, scheduled_end_date, priority, indoor, requires_freight, freight_details, logistics_notes, amount, installer_amount, currency, company_id, assigned_installer_id, created_at, project_id, site_id",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [
    { data: site },
    { data: project },
    { data: rating },
    { data: incidents },
    { data: conditionRows },
    roster,
    evidence,
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("name, address, city, state, zone, external_ref, location_id")
      .eq("id", order.site_id)
      .single(),
    supabase
      .from("projects")
      .select("name, billing_mode")
      .eq("id", order.project_id)
      .single(),
    supabase
      .from("ratings")
      .select("stars, comment")
      .eq("order_id", id)
      .maybeSingle(),
    supabase
      .from("order_incidents")
      .select("id, category, severity, description, requires_revisit, status, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_order_conditions")
      .select("condition")
      .eq("order_id", id),
    fetchActiveRoster(supabase),
    fetchOrderEvidence(supabase, id, { query: evidenceQuery, kind: evidenceKind }),
  ]);

  const amount =
    order.amount === null
      ? t("notDefined")
      : format.number(Number(order.amount), {
          style: "currency",
          currency: order.currency,
        });

  const canWriteEvidence = user ? canOperateCompany(user, order.company_id) : false;

  // Sólo el gerente resuelve un pedido de baja. El coordinador lo ve en la
  // bandeja de notificaciones, pero la decisión no es suya.
  const pendingCancellation =
    user?.role === "company_manager"
      ? await fetchPendingCancellation(supabase, id)
      : null;

  // El relevamiento, si esta orden tiene uno. La autoridad para decidir se
  // pregunta al servidor (DEC-15) en vez de deducirla acá: si la pantalla y la
  // función discreparan, el usuario vería un botón que siempre falla.
  const survey = await fetchSurveyState(supabase, id);
  const surveyAuthority =
    survey?.status === "submitted"
      ? await fetchSurveyDecisionAuthority(supabase, survey.activityId)
      : null;

  // El prerrequisito de la ejecución, para poder explicar el bloqueo antes de
  // que alguien choque con él. Quién puede dispensarlo lo dice el servidor.
  const prerequisite = await fetchPrerequisiteState(supabase, id);
  const canWaive = prerequisite
    ? (await fetchSurveyDecisionAuthority(supabase, prerequisite.surveyActivityId)) !==
      null
    : false;

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <BackLink href="/orders" label={t("back")} />

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">
              {order.order_number}
            </span>
            <StatusBadge status={order.status as OrderStatus} kind="order" />
          </div>
          <h1 className="mt-1 text-2xl font-bold">{order.title}</h1>
          {project && (
            <Link
              href={`/projects/${order.project_id}`}
              className="mt-1 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              {project.name}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
        <OrderPdfButton orderId={order.id} size="default" />
        <EditOrderDialog
          orderId={order.id}
          currency={order.currency}
          canEditAmount={
            user?.role === "company_manager" && project?.billing_mode === "per_installation"
          }
          canManageFinance={user?.role === "company_manager"}
          roster={roster.map(({ id: rosterId, name }) => ({ id: rosterId, name }))}
          defaults={{
            title: order.title,
            description: order.description ?? "",
            scheduledDate: order.scheduled_date ?? "",
            scheduledEndDate: order.scheduled_end_date ?? "",
            priority: order.priority,
            indoor: order.indoor,
            requiresFreight: order.requires_freight,
            freightDetails: order.freight_details ?? "",
            logisticsNotes: order.logistics_notes ?? "",
            amount: order.amount,
            installerAmount: order.installer_amount,
            installerId: order.assigned_installer_id ?? "",
            conditions: (conditionRows ?? []).map((row) => row.condition),
          }}
        />
        </div>
      </div>

      {prerequisite && (prerequisite.blocked || prerequisite.waivedAt) ? (
        <div className="mt-6">
          <PrerequisiteNotice state={prerequisite} canWaive={canWaive} />
        </div>
      ) : null}

      {survey && survey.submissionId && surveyAuthority ? (
        <div className="mt-6">
          <SurveyReview
            submissionId={survey.submissionId}
            version={survey.version}
            notes={survey.notes}
            submittedAt={survey.submittedAt}
            authority={surveyAuthority}
          />
        </div>
      ) : null}

      {pendingCancellation ? (
        <div className="mt-6">
          <CancellationReview
            requestId={pendingCancellation.id}
            installerName={pendingCancellation.installerName}
            reasonLabel={cancelT(REASON_KEY[pendingCancellation.reasonCode])}
            reasonNote={pendingCancellation.reasonNote}
            requestedAt={pendingCancellation.requestedAt}
            scheduledDateAtRequest={pendingCancellation.scheduledDateAtRequest}
          />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardContent className="py-5">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <StatusStepper status={order.status as OrderStatus} />
            </div>
          </div>
          {/* Atajos a lo que se hace habitualmente desde acá, sin bajar al panel. */}
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            {order.assigned_installer_id ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/messages/${order.assigned_installer_id}`}>
                  <MessageSquareText className="size-3.5" aria-hidden="true" />
                  {t("messageInstaller")}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href="#evidencia">
                <Images className="size-3.5" aria-hidden="true" />
                {t("viewEvidence")}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="#incidencias">
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                {t("reportIncident")}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Columna principal */}
        <div className="flex flex-col gap-6">
          {/* Punto */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">{t("site")}</h2>
              {site?.location_id ? (
                <Link href={`/locations/${site.location_id}`} className="mt-2 inline-block font-medium transition-colors hover:text-primary">
                  {site.name}
                </Link>
              ) : (
                <p className="mt-2 font-medium">{site?.name}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {[site?.address, site?.city, site?.state].filter(Boolean).join(", ") || t("noAddress")}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                {site?.zone && (
                  <span>
                    {t("zone")} <span className="font-mono">{site.zone}</span>
                  </span>
                )}
                {site?.external_ref && (
                  <span>
                    {t("code")} <span className="font-mono">{site.external_ref}</span>
                  </span>
                )}
                {order.scheduled_date && (
                  <span>
                    {t("scheduled")} <span className="font-mono">{order.scheduled_date}</span>
                  </span>
                )}
              </div>
              {order.description && (
                <p className="mt-4 whitespace-pre-wrap text-sm">{order.description}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("planning")}
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("scheduled")}</dt>
                  <dd className="mt-1 font-mono text-sm">
                    {order.scheduled_date ?? t("notDefined")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("endDate")}</dt>
                  <dd className="mt-1 font-mono text-sm">
                    {order.scheduled_end_date ?? t("notDefined")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("priority")}</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {createOrderT(`priorities.${order.priority}`)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("indoor")}</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {order.indoor ? t("yes") : t("no")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("freight")}</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {order.requires_freight ? t("yes") : t("no")}
                  </dd>
                </div>
                {user?.role === "company_manager" ? <div>
                  <dt className="text-xs text-muted-foreground">{t("amount")}</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">{amount}</dd>
                </div> : null}
              </dl>
              {order.freight_details ? (
                <div className="mt-5 border-t pt-4">
                  <p className="text-xs text-muted-foreground">{t("freightDetails")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{order.freight_details}</p>
                </div>
              ) : null}
              {order.logistics_notes ? (
                <div className="mt-4 border-t pt-4">
                  <p className="text-xs text-muted-foreground">{t("logistics")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{order.logistics_notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div id="evidencia" />
          <OrderEvidencePanel
            basePath={`/orders/${order.id}`}
            query={evidenceQuery}
            kind={evidenceKind}
            compose={
              canWriteEvidence ? (
                <OrderEvidenceCompose orderId={order.id} companyId={order.company_id} />
              ) : null
            }
            items={evidence.items}
            photoUrlByPath={evidence.photoUrlByPath}
            authorNameById={evidence.authorNameById}
            currentUserId={user?.id ?? null}
          />

          <div id="incidencias" />
          <OrderIncidents orderId={order.id} incidents={incidents ?? []} />
        </div>

        {/* Panel de acciones */}
        <Card className="h-fit">
          <CardContent className="pt-6">
            <OrderActions
              orderId={order.id}
              status={order.status as OrderStatus}
              installerId={order.assigned_installer_id}
              scheduledDate={order.scheduled_date}
              scheduledEndDate={order.scheduled_end_date}
              roster={roster}
              rating={rating}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
