import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrderAttachments } from "@/lib/data/order-attachments";
import { TaskActions } from "@/components/installer/task-actions";
import { OrderAttachments } from "@/components/shared/order-attachments";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus, OrderUpdateType } from "@/types/database";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, statusT, createOrderT, format] = await Promise.all([
    getTranslations("TaskDetail"),
    getTranslations("Status"),
    getTranslations("CreateOrder"),
    getFormatter(),
  ]);
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, scheduled_end_date, priority, indoor, requires_freight, freight_details, logistics_notes, company_id, site_id",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [{ data: site }, { data: updates }, attachments] = await Promise.all([
    supabase
      .from("sites")
      .select("name, address, city, state, zone, lat, lng")
      .eq("id", order.site_id)
      .single(),
    supabase
      .from("order_updates")
      .select("id, type, note, photos, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    fetchOrderAttachments(supabase, id),
  ]);

  const mapsUrl = site
    ? site.lat && site.lng
      ? `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [site.address, site.city, site.state].filter(Boolean).join(", "),
        )}`
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/tasks"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {t("back")}
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <span className="font-mono text-sm text-muted-foreground">
          {order.order_number}
        </span>
        <StatusBadge status={order.status as OrderStatus} kind="order" />
      </div>
      <h1 className="mt-1 text-xl font-bold">{order.title}</h1>

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

      <div className="mt-4">
        <OrderAttachments
          attachments={attachments}
          title={t("attachments")}
          openLabel={(name) => t("openAttachment", { name })}
        />
      </div>

      {/* Acciones */}
      <Card className="mt-4">
        <CardContent className="pt-6">
          <TaskActions
            orderId={order.id}
            companyId={order.company_id}
            status={order.status as OrderStatus}
          />
        </CardContent>
      </Card>

      {/* Historial */}
      {(updates ?? []).length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <h2 className="text-sm font-medium text-muted-foreground">{t("history")}</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {(updates ?? []).map((u) => (
                <li key={u.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {statusT(`update.${u.type as OrderUpdateType}`)}
                      </span>
                      {u.note ? ` — ${u.note}` : ""}
                    </p>
                    {Array.isArray(u.photos) && u.photos.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t("photos", { count: u.photos.length })}
                      </p>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">
                      {format.dateTime(new Date(u.created_at), {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
