import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveRoster } from "@/lib/data/orders";
import { OrderActions } from "@/components/company/order-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus, OrderUpdateType } from "@/types/database";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, statusT, format] = await Promise.all([
    getTranslations("OrderDetail"),
    getTranslations("Status"),
    getFormatter(),
  ]);
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, assigned_installer_id, created_at, project_id, site_id",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [
    { data: site },
    { data: project },
    { data: updates },
    { data: rating },
    roster,
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
      fetchActiveRoster(supabase),
    ]);

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
              roster={roster}
              rating={rating}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
