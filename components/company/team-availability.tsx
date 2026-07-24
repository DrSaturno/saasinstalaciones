import Link from "next/link";
import { CalendarOff, UserRoundCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type {
  CoordinatorOption,
  UnavailableInstaller,
} from "@/lib/data/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function TeamAvailability({
  coordinators,
  unavailable,
}: {
  coordinators: CoordinatorOption[];
  unavailable: UnavailableInstaller[];
}) {
  const [t, format] = await Promise.all([
    getTranslations("Team"),
    getFormatter(),
  ]);

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
            <div key={person.id} className="rounded-xl border px-4 py-3 text-sm">
              {person.name}
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
        </CardHeader>
        <CardContent className="space-y-2">
          {unavailable.length ? unavailable.map((item) => (
            <div key={item.id} className="rounded-xl border px-4 py-3">
              <Link
                href={`/messages/${item.installerId}`}
                className="text-sm font-medium hover:text-primary"
              >
                {item.name}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {format.dateTime(new Date(item.startsAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                →{" "}
                {format.dateTime(new Date(item.endsAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-1 text-xs">{item.reason}</p>
            </div>
          )) : <p className="text-sm text-muted-foreground">{t("noUnavailable")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
