import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveRoster } from "@/lib/data/orders";
import { fetchOrderAttachments } from "@/lib/data/order-attachments";
import { OrderActions } from "@/components/company/order-actions";
import { OrderIncidents } from "@/components/company/order-incidents";
import { OrderAttachments } from "@/components/shared/order-attachments";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus, OrderUpdateType } from "@/types/database";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, statusT, createOrderT, format] = await Promise.all([
    getTranslations("OrderDetail"),
    getTranslations("Status"),
    getTranslations("CreateOrder"),
    getFormatter(),
  ]);
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, scheduled_end_date, priority, indoor, requires_freight, freight_details, logistics_notes, amount, currency, assigned_installer_id, created_at, project_id, site_id",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [
    { data: site },
    { data: project },
    { data: updates },
    { data: rating },
    { data: incidents },
    roster,
    attachments,
  ] =
    await Promise.all([
      supabase
        .from("sites")
        .select("name, address, city, state, zone, external_ref")
        .eq("id", order.site_id)
        .single(),
      supabase.from("projects").select("name").eq("id", order.project_id).single(),
      supabase
        .from("order_updates")
        .select("id, type, note, created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
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
      fetchActiveRoster(supabase),
      fetchOrderAttachments(supabase, id),
    ]);

  const amount =
    order.amount === null
      ? t("notDefined")
      : format.number(Number(order.amount), {
          style: "currency",
          currency: order.currency,
        });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {t("back")}
      </Link>

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
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Columna principal */}
        <div className="flex flex-col gap-6">
          {/* Punto */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">{t("site")}</h2>
              <p className="mt-2 font-medium">{site?.name}</p>
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
                <div>
                  <dt className="text-xs text-muted-foreground">{t("amount")}</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">{amount}</dd>
                </div>
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

          <OrderAttachments
            attachments={attachments}
            title={t("attachments")}
            openLabel={(name) => t("openAttachment", { name })}
          />

          <OrderIncidents orderId={order.id} incidents={incidents ?? []} />

          {/* Historial */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">{t("history")}</h2>
              {(updates ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("emptyHistory")}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-4">
                  {(updates ?? []).map((u) => (
                    <li key={u.id} className="flex gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                      <div className="min-w-0">
                        <p className="text-sm">
                          {u.note || statusT(`update.${u.type as OrderUpdateType}`)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {format.dateTime(new Date(u.created_at), {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
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
