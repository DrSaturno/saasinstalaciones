import "server-only";

import { getTranslations } from "next-intl/server";
import type { z } from "zod";
import { invalidFieldMessage } from "@/lib/field-error-message";

/**
 * El error de validación de una orden con los rótulos de su formulario.
 *
 * Lo comparten el alta, el lote y la edición, que validan los mismos campos
 * (`orderFields`). Antes los tres respondían «Datos inválidos» incluso cuando
 * el esquema sabía exactamente qué pasaba —flete sin detalle, fecha de fin
 * anterior al inicio—, porque ese código se descartaba en la acción.
 *
 * `titleLabel` existe porque el lote rotula el título distinto («Título de las
 * órdenes»), y el mensaje tiene que decir lo mismo que la pantalla.
 */
export async function orderFieldError(
  error: z.ZodError,
  titleLabel?: string,
): Promise<string> {
  const f = await getTranslations("CreateOrder");
  return invalidFieldMessage(error, {
    siteId: f("site"),
    activityKind: f("activityKind"),
    title: titleLabel ?? f("workTitle"),
    status: f("initialStatus"),
    scheduledDate: f("startDate"),
    scheduledEndDate: f("endDate"),
    scheduledStartTime: f("startTime"),
    estimatedDurationMinutes: f("duration"),
    priority: f("priority"),
    installerId: f("installer"),
    description: f("description"),
    logisticsNotes: f("logistics"),
    freightDetails: f("freightDetails"),
    amount: f("amount"),
    installerAmount: f("installerAmount"),
  });
}
