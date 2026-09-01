import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrderEvidence } from "@/lib/data/order-evidence";
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

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, scheduled_end_date, priority, indoor, requires_freight, freight_details, logistics_notes, company_id, site_id, installer_accepted_at",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [{ data: site }, evidence] = await Promise.all([
    supabase
      .from("sites")
      .select("name, address, city, state, zone, lat, lng")
      .eq("id", order.site_id)
      .single(),
    fetchOrderEvidence(supabase, id, { query: evidenceQuery, kind: evidenceKind }),
  ]);

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
        <OrderPdfButton orderId={order.id} />
      </div>

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
            orderId={order.id}
            companyId={order.company_id}
            status={order.status as OrderStatus}
            acceptedAt={order.installer_accepted_at}
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
