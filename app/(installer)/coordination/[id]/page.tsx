import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin, MessageSquare } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isCoordinatorSomewhere, ROLE_HOME } from "@/lib/auth";
import { fetchOrderAttachments } from "@/lib/data/order-attachments";
import { signUpdatePhotos } from "@/lib/data/update-photos";
import { googleMapsHref } from "@/lib/domain/sites";
import { CoordinationOrderActions } from "@/components/installer/coordination-order-actions";
import { OrderAttachments } from "@/components/shared/order-attachments";
import { UpdatePhotos } from "@/components/shared/update-photos";
import { StatusStepper } from "@/components/shared/status-stepper";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderPdfButton } from "@/components/shared/order-pdf-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderUpdateType } from "@/types/database";

/**
 * La orden vista desde adentro por el coordinador. RLS la acota a los
 * proyectos que conduce: si la orden no es suya, no la encuentra.
 */
export default async function CoordinationOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCoordinatorSomewhere(user)) redirect(ROLE_HOME[user.role]);

  const [t, statusT, taskT, format, supabase] = await Promise.all([
    getTranslations("Coordination"),
    getTranslations("Status"),
    getTranslations("TaskDetail"),
    getFormatter(),
    createClient(),
  ]);

  const { data: order } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, description, status, scheduled_date, site_id, project_id, company_id, assigned_installer_id, installer_accepted_at",
    )
    .eq("id", id)
    .single();
  if (!order) notFound();

  const [{ data: site }, { data: project }, { data: updates }, attachments] =
    await Promise.all([
      supabase
        .from("sites")
        .select("name, address, city, state, zone, lat, lng")
        .eq("id", order.site_id)
        .single(),
      supabase.from("projects").select("name").eq("id", order.project_id).single(),
      supabase
        .from("order_updates")
        .select("id, type, note, photos, created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
      fetchOrderAttachments(supabase, id),
    ]);

  const [photoUrls, { data: installer }] = await Promise.all([
    signUpdatePhotos(supabase, updates ?? []),
    order.assigned_installer_id
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", order.assigned_installer_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const hasSurvey = (updates ?? []).some((update) => update.type === "survey");
  const maps = site
    ? googleMapsHref({
        lat: site.lat,
        lng: site.lng,
        address: site.address,
        city: site.city,
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6">
      <Link
        href="/coordination"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("backToBoard")}
      </Link>

      <header className="mt-4">
        <p className="font-mono text-xs text-muted-foreground">{order.order_number}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{order.title}</h1>
            <StatusBadge status={order.status} kind="order" />
          </div>
          <OrderPdfButton orderId={order.id} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{project?.name}</p>
      </header>

      <div className="mt-5">
        <StatusStepper status={order.status} />
      </div>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            {t("site")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="font-medium">{site?.name}</p>
          <p className="text-muted-foreground">
            {[site?.address, site?.city, site?.state].filter(Boolean).join(", ")}
          </p>
          {order.scheduled_date ? (
            <p className="font-mono text-xs text-muted-foreground">
              {format.dateTime(new Date(`${order.scheduled_date}T12:00:00Z`), {
                dateStyle: "medium",
              })}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-2">
            {maps ? (
              <Button asChild size="sm" variant="outline">
                <a href={maps} target="_blank" rel="noreferrer">
                  {t("directions")}
                </a>
              </Button>
            ) : null}
            {order.assigned_installer_id ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/messages/${order.assigned_installer_id}?company=${order.company_id}`}
                >
                  <MessageSquare className="size-4" />
                  {installer?.full_name || t("chat")}
                </Link>
              </Button>
            ) : (
              <span className="self-center text-xs text-muted-foreground">
                {t("unassigned")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {order.description ? (
        <Card className="mt-4">
          <CardHeader className="border-b">
            <CardTitle>{t("descriptionLabel")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.description}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-4">
        <OrderAttachments
          attachments={attachments}
          title={t("attachments")}
          openLabel={(name) => t("openAttachment", { name })}
        />
      </div>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <CardTitle>{t("actions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CoordinationOrderActions
            orderId={order.id}
            orderNumber={order.order_number}
            status={order.status}
            assignedInstallerId={order.assigned_installer_id}
            acceptedAt={order.installer_accepted_at}
            hasSurvey={hasSurvey}
            scheduledDate={order.scheduled_date}
            viewerId={user.id}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(updates ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noHistory")}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {(updates ?? []).map((update) => (
                <li key={update.id} className="flex gap-3">
                  <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {statusT(`update.${update.type as OrderUpdateType}`)}
                      </span>
                      {update.note ? ` — ${update.note}` : ""}
                    </p>
                    <UpdatePhotos
                      photos={update.photos}
                      urlByPath={photoUrls}
                      openLabel={taskT("openPhoto")}
                    />
                    <p className="font-mono text-xs text-muted-foreground">
                      {format.dateTime(new Date(update.created_at), {
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
