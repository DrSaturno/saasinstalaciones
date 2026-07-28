import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Route as RouteIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME, isInstallerArea } from "@/lib/auth";
import { buildRouteUrl, stopHref } from "@/lib/domain/route";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderStatus } from "@/types/database";

type Stop = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  sites: {
    name: string;
    address: string;
    city: string;
    lat: number | null;
    lng: number | null;
  } | null;
};

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function InstallerRoutePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isInstallerArea(user.role)) redirect(ROLE_HOME[user.role]);

  const [t, supabase] = await Promise.all([
    getTranslations("InstallerRoute"),
    createClient(),
  ]);
  const today = localDate();

  // Paradas de hoy: lo programado para hoy y lo que quedó pendiente de días
  // anteriores, que es trabajo que sigue estando en la calle.
  const { data } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, status, scheduled_date, sites(name, address, city, lat, lng)",
    )
    .in("status", ["planificada", "en_proceso", "relevamiento"])
    .not("scheduled_date", "is", null)
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .overrideTypes<Stop[]>();

  const stops = (data ?? []) as Stop[];
  const routeStops = stops.map((stop) => ({
    lat: stop.sites?.lat ?? null,
    lng: stop.sites?.lng ?? null,
    address: stop.sites?.address ?? "",
    city: stop.sites?.city ?? "",
  }));
  const fullRoute = buildRouteUrl(routeStops);
  const locatable = routeStops.filter((stop) => stop.lat !== null || stop.address).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {fullRoute ? (
          <Button asChild>
            <a href={fullRoute} target="_blank" rel="noreferrer">
              <RouteIcon className="size-4" aria-hidden="true" />
              {t("openFullRoute")}
            </a>
          </Button>
        ) : null}
      </header>

      {stops.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="py-14 text-center">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader className="border-b">
              <CardTitle>{t("summary", { stops: stops.length, locatable })}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ol className="divide-y">
                {stops.map((stop, index) => {
                  const site = stop.sites;
                  const href = stopHref({
                    lat: site?.lat ?? null,
                    lng: site?.lng ?? null,
                    address: site?.address ?? "",
                    city: site?.city ?? "",
                  });
                  return (
                    <li key={stop.id} className="flex gap-3 px-4 py-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/tasks/${stop.id}`}
                            className="min-w-0 truncate font-medium hover:text-primary"
                          >
                            {site?.name ?? stop.title}
                          </Link>
                          <StatusBadge status={stop.status} kind="order" />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {[site?.address, site?.city].filter(Boolean).join(", ") || stop.title}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {stop.order_number}
                            {stop.scheduled_date && stop.scheduled_date < today
                              ? ` · ${t("overdue")}`
                              : ""}
                          </span>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <MapPin className="size-3" aria-hidden="true" />
                              {t("navigate")}
                            </a>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {t("noLocation")}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
          {!fullRoute ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("needTwoStops")}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
