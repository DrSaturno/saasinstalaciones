import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveRoster } from "@/lib/data/orders";
import { OrderActions } from "@/components/company/order-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus, OrderUpdateType } from "@/types/database";

const UPDATE_LABEL: Record<OrderUpdateType, string> = {
  checkin: "Check-in",
  progress: "Avance",
  blocker: "Bloqueo",
  done: "Trabajo terminado",
  system: "Sistema",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, assigned_installer_id, created_at, project_id, site_id",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [{ data: site }, { data: project }, { data: updates }, roster] =
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
      fetchActiveRoster(supabase),
    ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Órdenes
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
              <h2 className="text-sm font-medium text-muted-foreground">Punto de instalación</h2>
              <p className="mt-2 font-medium">{site?.name}</p>
              <p className="text-sm text-muted-foreground">
                {[site?.address, site?.city, site?.state].filter(Boolean).join(", ") || "Sin dirección"}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                {site?.zone && (
                  <span>
                    Zona <span className="font-mono">{site.zone}</span>
                  </span>
                )}
                {site?.external_ref && (
                  <span>
                    Código <span className="font-mono">{site.external_ref}</span>
                  </span>
                )}
                {order.scheduled_date && (
                  <span>
                    Agendada <span className="font-mono">{order.scheduled_date}</span>
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
              <h2 className="text-sm font-medium text-muted-foreground">Historial</h2>
              {(updates ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Sin movimientos todavía.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-4">
                  {(updates ?? []).map((u) => (
                    <li key={u.id} className="flex gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                      <div className="min-w-0">
                        <p className="text-sm">{u.note || UPDATE_LABEL[u.type as OrderUpdateType]}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatDate(u.created_at)}
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
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
