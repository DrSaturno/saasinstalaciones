import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskActions } from "@/components/installer/task-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus, OrderUpdateType } from "@/types/database";

const UPDATE_LABEL: Record<OrderUpdateType, string> = {
  checkin: "Check-in",
  progress: "Avance",
  blocker: "Bloqueo",
  done: "Terminado",
  system: "Sistema",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, company_id, site_id",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [{ data: site }, { data: updates }] = await Promise.all([
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
        ← Mis tareas
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
              "Sin dirección"}
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
              Cómo llegar →
            </a>
          )}
        </CardContent>
      </Card>

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
            <h2 className="text-sm font-medium text-muted-foreground">Historial</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {(updates ?? []).map((u) => (
                <li key={u.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {UPDATE_LABEL[u.type as OrderUpdateType]}
                      </span>
                      {u.note ? ` — ${u.note}` : ""}
                    </p>
                    {Array.isArray(u.photos) && u.photos.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {u.photos.length} foto
                        {u.photos.length === 1 ? "" : "s"}
                      </p>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatDate(u.created_at)}
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
