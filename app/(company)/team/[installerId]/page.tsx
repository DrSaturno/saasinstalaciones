import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare, Phone, MapPin, CalendarDays } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchInstallerProfile } from "@/lib/data/installer-profile";
import { ORDER_STATUS } from "@/lib/domain/status";
import { StarRating } from "@/components/shared/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackLink } from "@/components/shared/back-link";

export default async function InstallerProfilePage({
  params,
}: {
  params: Promise<{ installerId: string }>;
}) {
  const { installerId } = await params;
  const supabase = await createClient();
  const [t, statusT, format, profile] = await Promise.all([
    getTranslations("InstallerProfile"),
    getTranslations("Status"),
    getFormatter(),
    fetchInstallerProfile(supabase, installerId),
  ]);

  if (!profile) notFound();

  const initials = profile.name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  const openOrders = profile.orders.filter(
    (order) => !["finalizada", "cancelada"].includes(order.status),
  ).length;
  const doneOrders = profile.orders.filter(
    (order) => order.status === "finalizada",
  ).length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BackLink href="/team" label={t("backToTeam")} />

      {/* Encabezado del perfil */}
      <div className="mt-4 rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt=""
                width={128}
                height={128}
                unoptimized
                className="size-16 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold">
                {initials || "?"}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={profile.rosterStatus === "active" ? "default" : "secondary"}>
                  {t(`roster.${profile.rosterStatus ?? "removed"}`)}
                </Badge>
                <Badge variant="secondary">
                  {profile.available ? t("available") : t("unavailable")}
                </Badge>
              </div>
              {profile.ratingCount > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                  <StarRating value={Math.round(profile.ratingAvg)} />
                  <span className="font-mono text-sm">
                    {profile.ratingAvg.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("ratingCount", { count: profile.ratingCount })}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("noRatings")}</p>
              )}
            </div>
          </div>

          <Button asChild variant="outline">
            <Link href={`/messages/${profile.id}`}>
              <MessageSquare className="size-4" />
              {t("openChat")}
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Fact icon={<CalendarDays className="size-4" />} label={t("memberSince")}>
            {profile.memberSince
              ? format.dateTime(new Date(profile.memberSince), {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </Fact>
          <Fact icon={<Phone className="size-4" />} label={t("phone")}>
            {profile.phone ? (
              <a href={`tel:${profile.phone}`} className="hover:text-primary">
                {profile.phone}
              </a>
            ) : (
              "—"
            )}
          </Fact>
          <Fact icon={<MapPin className="size-4" />} label={t("coverage")}>
            {profile.serviceRadiusKm ? t("radius", { km: profile.serviceRadiusKm }) : "—"}
          </Fact>
        </div>
      </div>

      {/* Métricas */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("metricTotal")} value={profile.orders.length} />
        <Metric label={t("metricOpen")} value={openOrders} />
        <Metric label={t("metricDone")} value={doneOrders} />
        <Metric label={t("metricReviews")} value={profile.reviews.length} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Zonas y especialidades */}
        <Card>
          <CardHeader>
            <CardTitle>{t("zonesAndSkills")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("zones")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.zones.length ? (
                  profile.zones.map((zone) => (
                    <Badge key={zone} variant="secondary">{zone}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("skills")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.skills.length ? (
                  profile.skills.map((skill) => (
                    <Badge key={skill} variant="secondary">{skill}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empresas */}
        <Card>
          <CardHeader>
            <CardTitle>{t("worksFor")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border px-4 py-3 text-sm">
              {profile.companyName}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("worksForNote")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reseñas */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("reviews")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.reviews.length ? (
            profile.reviews.map((review) => (
              <div key={review.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StarRating value={review.stars} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {review.orderNumber} ·{" "}
                    {format.dateTime(new Date(review.createdAt), {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {review.comment ? (
                  <p className="mt-2 text-sm">{review.comment}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
          )}
        </CardContent>
      </Card>

      {/* Órdenes */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("orders")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {profile.orders.length ? (
            profile.orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm hover:bg-muted/60"
              >
                <div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {order.orderNumber}
                  </span>
                  <p className="font-medium">{order.title}</p>
                  {order.projectName ? (
                    <p className="text-xs text-muted-foreground">{order.projectName}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {order.scheduledDate ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {format.dateTime(new Date(order.scheduledDate), {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  ) : null}
                  <Badge
                    variant="secondary"
                    style={{
                      backgroundColor: ORDER_STATUS[order.status].bg,
                      color: ORDER_STATUS[order.status].fg,
                    }}
                  >
                    {statusT(ORDER_STATUS[order.status].key)}
                  </Badge>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("noOrders")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
    </div>
  );
}
