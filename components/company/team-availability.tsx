import Link from "next/link";
import { CalendarOff, UserRoundCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { UnavailableInstaller } from "@/lib/data/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnavailabilityReview } from "@/components/company/unavailability-review";
import { MemberRolesField } from "@/components/company/member-roles-field";
import type { MembershipRole } from "@/types/database";

/** A diferencia de `CoordinatorOption` (usada en selects simples de coordinador
 *  en broadcasts/proyectos), acá hace falta `roles`: este widget deja tocar
 *  la membresía, no sólo elegir a alguien. */
type CoordinatorWithRoles = { id: string; name: string; roles: MembershipRole[] };

export async function TeamAvailability({
  coordinators,
  unavailable,
  canReview = false,
}: {
  coordinators: CoordinatorWithRoles[];
  unavailable: UnavailableInstaller[];
  canReview?: boolean;
}) {
  const [t, format] = await Promise.all([
    getTranslations("Team"),
    getFormatter(),
  ]);
  const pending = unavailable.filter((item) => item.status === "pending");
  const resolved = unavailable.filter((item) => item.status !== "pending");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundCheck className="size-4 text-primary" />
            {t("coordinators")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {coordinators.length ? coordinators.map((person) => (
            <div
              key={person.id}
              className="flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
            >
              <span>{person.name}</span>
              <MemberRolesField
                installerId={person.id}
                name={person.name}
                roles={person.roles}
                canManage={canReview}
              />
            </div>
          )) : <p className="text-sm text-muted-foreground">{t("noCoordinators")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="size-4 text-amber-600" />
            {t("unavailableTitle")}
          </CardTitle>
          {pending.length ? (
            <p className="text-xs text-muted-foreground">
              {t("pendingCount", { count: pending.length })}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {unavailable.length ? (
            <>
              {pending.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-warning/40 bg-amber-50/60 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/team/${item.installerId}`}
                      className="text-sm font-medium hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                      {t("statusPending")}
                    </span>
                  </div>
                  <Period item={item} format={format} />
                  <p className="mt-1 text-xs">{item.reason}</p>
                  {canReview ? <UnavailabilityReview id={item.id} name={item.name} /> : null}
                </div>
              ))}
              {resolved.map((item) => (
                <div key={item.id} className="rounded-xl border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/team/${item.installerId}`}
                      className="text-sm font-medium hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        item.status === "approved"
                          ? "bg-success/15 text-green-700"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {item.status === "approved" ? t("statusApproved") : t("statusRejected")}
                    </span>
                  </div>
                  <Period item={item} format={format} />
                  <p className="mt-1 text-xs">{item.reason}</p>
                  {item.reviewNote ? (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      {item.reviewNote}
                    </p>
                  ) : null}
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noUnavailable")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Period({
  item,
  format,
}: {
  item: UnavailableInstaller;
  format: Awaited<ReturnType<typeof getFormatter>>;
}) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {format.dateTime(new Date(item.startsAt), { dateStyle: "medium", timeStyle: "short" })} →{" "}
      {format.dateTime(new Date(item.endsAt), { dateStyle: "medium", timeStyle: "short" })}
    </p>
  );
}
