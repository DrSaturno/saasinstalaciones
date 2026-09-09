import { CalendarPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { googleCalendarEventUrl } from "@/lib/google-calendar/event-link";
import { Button } from "@/components/ui/button";

/**
 * Agenda la orden en el Google Calendar de quien lo toca.
 *
 * Es un link, no una acción: no necesita que la empresa tenga conectada la
 * cuenta ni que quien lo usa tenga permisos sobre nada. Por eso es lo que le
 * sirve al instalador, y por eso no pasa por la cola offline — si no hay
 * señal, simplemente no abre, y no queda ningún estado a medias que
 * reconciliar después (DEC-GCAL-03).
 */
export async function CalendarizeOrderButton({
  orderNumber,
  title,
  scheduledDate,
  scheduledEndDate,
  description,
  location,
  orderUrl,
  size = "default",
}: {
  orderNumber: string;
  title: string;
  /** Sin fecha no se renderiza: no hay nada que agendar. */
  scheduledDate: string | null;
  scheduledEndDate?: string | null;
  description?: string | null;
  location?: string | null;
  orderUrl?: string | null;
  size?: "default" | "field" | "sm";
}) {
  if (!scheduledDate) return null;
  const t = await getTranslations("Calendar");

  return (
    <Button asChild variant="outline" size={size}>
      <a
        href={googleCalendarEventUrl({
          orderNumber,
          title,
          scheduledDate,
          scheduledEndDate,
          description,
          location,
          orderUrl,
        })}
        target="_blank"
        rel="noopener noreferrer"
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        {t("addToGoogle")}
      </a>
    </Button>
  );
}
