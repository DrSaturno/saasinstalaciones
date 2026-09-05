import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrderEvidence } from "@/lib/data/order-evidence";
import { fetchBusinessCalendar } from "@/lib/data/business-calendar";
import {
  fetchInstallerSchedule,
  fetchPendingReschedule,
} from "@/lib/data/reschedules";
import { findScheduleConflicts } from "@/lib/domain/schedule-conflicts";
import { rescheduleState } from "@/lib/domain/reschedule";
import { RescheduleResponse } from "@/components/installer/reschedule-response";
import { hasOpenCancellationRequest } from "@/lib/data/cancellations";
import { businessDaysUntil } from "@/lib/domain/business-days";
import { RequestCancellationDialog } from "@/components/installer/request-cancellation-dialog";
import { SurveyPanel } from "@/components/installer/survey-panel";
import { fetchPrerequisiteState, fetchSurveyState } from "@/lib/data/surveys";
import { PrerequisiteNotice } from "@/components/shared/prerequisite-notice";
import { TaskActions } from "@/components/installer/task-actions";
import { TaskEvidenceCompose } from "@/components/installer/task-evidence-compose";
import { OrderEvidencePanel } from "@/components/shared/order-evidence-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderPdfButton } from "@/components/shared/order-pdf-button";
import { Card, CardContent } from "@/components/ui/card";
import { ORDER_EVIDENCE_KINDS, type EvidenceKind } from "@/lib/domain/order-evidence";
import type { OrderStatus } from "@/types/database";
import { getCurrentUser } from "@/lib/auth";
import { BackLink } from "@/components/shared/back-link";
import { throwIfDataError } from "@/lib/data/errors";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { id } = await params;
  const [{ q, kind: kindParam }, t, createOrderT, user] = await Promise.all([
    searchParams,
    getTranslations("TaskDetail"),
    getTranslations("CreateOrder"),
    getCurrentUser(),
  ]);
  const evidenceQuery = q ?? "";
  const evidenceKind: EvidenceKind | null = ORDER_EVIDENCE_KINDS.includes(
    kindParam as EvidenceKind,
  )
    ? (kindParam as EvidenceKind)
    : null;
  if (!user) notFound();

  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, scheduled_end_date, priority, indoor, requires_freight, freight_details, logistics_notes, company_id, site_id, installer_accepted_at",
    )
    .eq("id", id)
    .single();
  throwIfDataError("task.detail", orderError);
  if (!order) notFound();

  // El mínimo de fotos y el conteo actual salen de la misma función que usa el
  // trigger, así que el botón de cerrar dice exactamente lo que la base va a
  // exigir. Calcularlo acá con otra consulta habría dado dos números capaces
  // de discrepar, que es peor que no mostrar ninguno.
  const [siteResult, evidence, minPhotosResult, photoCountResult] =
    await Promise.all([
      supabase
        .from("sites")
        .select("name, address, city, state, zone, lat, lng")
        .eq("id", order.site_id)
        .single(),
      fetchOrderEvidence(supabase, id, { query: evidenceQuery, kind: evidenceKind }),
      supabase.rpc("order_min_photos", { p_order: id }),
      supabase.rpc("order_photo_count", { p_order: id }),
    ]);
  throwIfDataError("task.site", siteResult.error);
  throwIfDataError("task.minimum_photos", minPhotosResult.error);
  throwIfDataError("task.photo_count", photoCountResult.error);
  const site = siteResult.data;
  const minPhotos = minPhotosResult.data;
  const photoCount = photoCountResult.data;

  // Reprogramación pendiente de este instalador, si la hay. Se resuelve el
  // vencimiento en el servidor: el calendario de feriados vive acá, y mandarlo
  // entero al cliente para recalcularlo sería trabajo de más y una segunda
  // fuente de verdad.
  const pending = user ? await fetchPendingReschedule(supabase, id, user.id) : null;
  let reschedulePrompt: {
    deadline: string;
    businessDaysLeft: number;
    expired: boolean;
    conflicts: Awaited<ReturnType<typeof fetchInstallerSchedule>>;
  } | null = null;

  if (pending && user) {
    const [calendar, schedule] = await Promise.all([
      fetchBusinessCalendar(supabase, pending.calendarCountry, order.company_id),
      fetchInstallerSchedule(supabase, user.id),
    ]);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: pending.calendarTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const state = rescheduleState(
      {
        notifiedAt: pending.notifiedAt,
        response: null,
        respondedAt: null,
        supersededAt: null,
        responseWindowDays: pending.responseWindowDays,
      },
      today,
      pending.calendarTimezone,
      calendar,
    );
    if (state.kind === "awaiting" || state.kind === "expired") {
      reschedulePrompt = {
        deadline: state.deadline,
        businessDaysLeft: state.kind === "awaiting" ? state.businessDaysLeft : 0,
        expired: state.kind === "expired",
        conflicts: findScheduleConflicts(
          schedule,
          { start: pending.newDate, end: pending.newEndDate },
          id,
        ),
      };
    }
  }

  // Vista previa del plazo de baja. La autoridad es `business_days_between` en
  // el servidor, que es quien decide si el pedido se autoaprueba; esto sólo
  // sirve para decirle de antemano en qué está por meterse.
  let cancelPrompt: { withinNotice: boolean; businessDaysLeft: number } | null = null;
  if (
    user &&
    order.status !== "cancelada" &&
    order.status !== "finalizada" &&
    !(await hasOpenCancellationRequest(supabase, id, user.id))
  ) {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("country")
      .eq("id", order.company_id)
      .maybeSingle();
    throwIfDataError("task.company_country", companyError);
    const country = company?.country === "BR" ? "BR" : "AR";
    const calendar = await fetchBusinessCalendar(supabase, country, order.company_id);
    const timeZone =
      country === "BR" ? "America/Sao_Paulo" : "America/Argentina/Buenos_Aires";
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const left = order.scheduled_date
      ? businessDaysUntil(today, order.scheduled_date, calendar)
      : Number.MAX_SAFE_INTEGER;
    cancelPrompt = {
      withinNotice: left >= 2,
      businessDaysLeft: Math.max(left === Number.MAX_SAFE_INTEGER ? 0 : left, 0),
    };
  }

  const survey = await fetchSurveyState(supabase, id);
  const prerequisite = await fetchPrerequisiteState(supabase, id);

  const mapsUrl = site
    ? site.lat && site.lng
      ? `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [site.address, site.city, site.state].filter(Boolean).join(", "),
        )}`
    : null;

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <BackLink href="/tasks" label={t("back")} />

      <div className="mt-3 flex items-center gap-3">
        <span className="font-mono text-sm text-muted-foreground">
          {order.order_number}
        </span>
        <StatusBadge status={order.status as OrderStatus} kind="order" />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{order.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <OrderPdfButton orderId={order.id} />
          {cancelPrompt ? (
            <RequestCancellationDialog
              orderId={order.id}
              withinNotice={cancelPrompt.withinNotice}
              businessDaysLeft={cancelPrompt.businessDaysLeft}
            />
          ) : null}
        </div>
      </div>

      {prerequisite && (prerequisite.blocked || prerequisite.waivedAt) ? (
        <div className="mt-4">
          {/* El instalador ve POR QUÉ no puede arrancar, pero no puede
              dispensarlo: eso es del coordinador (DEC-15). */}
          <PrerequisiteNotice state={prerequisite} canWaive={false} />
        </div>
      ) : null}

      {survey ? <SurveyPanel survey={survey} /> : null}

      {pending && reschedulePrompt ? (
        <RescheduleResponse
          rescheduleId={pending.id}
          newDate={pending.newDate}
          newEndDate={pending.newEndDate}
          deadline={reschedulePrompt.deadline}
          businessDaysLeft={reschedulePrompt.businessDaysLeft}
          expired={reschedulePrompt.expired}
          reason={pending.reason}
          conflicts={reschedulePrompt.conflicts}
        />
      ) : null}

      {/* Punto */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <p className="font-medium">{site?.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {[site?.address, site?.city, site?.state].filter(Boolean).join(", ") ||
              t("noAddress")}
          </p>
          {order.description && (
            <p className="mt-3 whitespace-pre-wrap text-sm">{order.description}</p>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t("directions")}
            </a>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">{t("planning")}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("scheduled")}</dt>
              <dd className="mt-1 font-mono">
                {order.scheduled_date ?? t("notDefined")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("endDate")}</dt>
              <dd className="mt-1 font-mono">
                {order.scheduled_end_date ?? t("notDefined")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("priority")}</dt>
              <dd className="mt-1 font-medium">
                {createOrderT(`priorities.${order.priority}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("indoor")}</dt>
              <dd className="mt-1 font-medium">{order.indoor ? t("yes") : t("no")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("freight")}</dt>
              <dd className="mt-1 font-medium">
                {order.requires_freight ? t("yes") : t("no")}
              </dd>
            </div>
          </dl>
          {order.freight_details || order.logistics_notes ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">{t("logistics")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {[order.freight_details, order.logistics_notes].filter(Boolean).join("\n")}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Acciones */}
      <Card className="mt-4">
        <CardContent className="pt-6">
          <TaskActions
            userId={user.id}
            orderId={order.id}
            companyId={order.company_id}
            status={order.status as OrderStatus}
            acceptedAt={order.installer_accepted_at}
            minPhotos={minPhotos ?? 3}
            photoCount={photoCount ?? 0}
          />
        </CardContent>
      </Card>

      <div className="mt-4">
        <OrderEvidencePanel
          basePath={`/tasks/${order.id}`}
          query={evidenceQuery}
          kind={evidenceKind}
          compose={
            <TaskEvidenceCompose orderId={order.id} companyId={order.company_id} />
          }
          items={evidence.items}
          photoUrlByPath={evidence.photoUrlByPath}
          authorNameById={evidence.authorNameById}
          currentUserId={user?.id ?? null}
        />
      </div>
    </div>
  );
}
