"use client";

import { useTransition } from "react";
import { CalendarSync } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { syncOrderToGoogleCalendar } from "@/lib/actions/calendar";
import { Button } from "@/components/ui/button";

/**
 * Manda esta orden al calendario de la empresa, sin sincronizar el resto.
 *
 * Sólo aparece con la conexión ya armada: ofrecerlo sin conexión sería un
 * botón que falla siempre.
 */
export function SendOrderToCalendarButton({ orderId }: { orderId: string }) {
  const t = useTranslations("Calendar");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      const result = await syncOrderToGoogleCalendar(orderId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("sentToCompany"));
      router.refresh();
    });

  return (
    <Button type="button" variant="outline" onClick={send} disabled={pending}>
      <CalendarSync className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
      {pending ? t("sending") : t("sendToCompany")}
    </Button>
  );
}
