import { z } from "zod";
import { ORDER_ACTIVITY_KINDS } from "@/lib/domain/activity-kind";
import { parseExplicitConditions } from "@/lib/domain/work-conditions";
import { isValidTime } from "@/lib/domain/schedule-precision";

export const ORDER_PRIORITIES = ["baja", "media", "alta", "urgente"] as const;
export const ORDER_INITIAL_STATUSES = [
  "pendiente",
  "relevamiento",
  "planificada",
] as const;

export const MAX_ORDER_ATTACHMENTS = 10;
export const MAX_ORDER_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const POSTGRES_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const databaseIdSchema = z.string().regex(POSTGRES_UUID);

const optionalDate = z
  .union([z.literal(""), z.iso.date()])
  .transform((value) => value || null);

const optionalTime = z
  .union([z.literal(""), z.string().refine(isValidTime)])
  .transform((value) => (value === "" ? null : value));

const optionalUuid = z
  .union([z.literal(""), databaseIdSchema])
  .transform((value) => value || null);

const optionalAmount = z
  .union([
    z.literal(""),
    z.coerce.number().finite().min(0).max(999_999_999_999.99),
  ])
  .transform((value) => (value === "" ? null : value));

/** Campos que se cargan igual al crear y al editar una orden. */
const orderFields = {
  title: z.string().trim().min(2).max(200),
  // Qué contiene la orden: sólo relevamiento, sólo ejecución, o las dos.
  // `execution` por default para que los formularios que todavía no mandan el
  // campo sigan comportándose exactamente como antes.
  activityKind: z.enum(ORDER_ACTIVITY_KINDS).default("execution"),
  description: z.string().trim().max(4_000).default(""),
  scheduledDate: optionalDate,
  scheduledEndDate: optionalDate,
  // Hora de inicio y fin del trabajo. Opcionales: una orden puede agendarse
  // sólo por día, y de eso depende qué se puede afirmar después sobre
  // conflictos de agenda (AG-R10). Vacío significa «no se sabe», nunca cero.
  // Con `default`: los formularios que todavía no mandan el campo —el diálogo
  // de lote, por ejemplo— siguen valiendo, y ausente significa «sin hora», que
  // es un estado legítimo, no un error.
  scheduledStartTime: optionalTime.default(null),
  scheduledEndTime: optionalTime.default(null),
  // Sirve para derivar el fin cuando sólo se carga el inicio.
  estimatedDurationMinutes: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(24 * 60)])
    .transform((value) => (value === "" ? null : value))
    .default(null),
  priority: z.enum(ORDER_PRIORITIES).default("media"),
  indoor: z.boolean().default(false),
  requiresFreight: z.boolean().default(false),
  // Condiciones objetivas del trabajo (DEC-16). Se filtran contra el catálogo
  // en vez de validarse con un enum para que una casilla desconocida no
  // rechace el alta entera: lo que no está en el catálogo simplemente no entra.
  conditions: z
    .array(z.unknown())
    .default([])
    .transform((values) => parseExplicitConditions(values)),
  freightDetails: z.string().trim().max(1_000).default(""),
  logisticsNotes: z.string().trim().max(2_000).default(""),
  // `amount` es lo que se le cobra al cliente; `installerAmount`, lo que se le
  // paga a quien ejecuta. Dos números distintos: sin los dos no hay margen.
  amount: optionalAmount,
  // Con `default`: los formularios que ocultan el costo (coordinador, o el
  // diálogo de lote sin permiso financiero) no mandan el campo, y ausente no
  // puede significar error — significa «sin costo cargado».
  installerAmount: optionalAmount.default(null),
  installerId: optionalUuid,
};

type OrderFieldValues = {
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  requiresFreight: boolean;
  freightDetails: string;
};

function checkOrderFields(value: OrderFieldValues, context: z.RefinementCtx) {
  if (
    value.scheduledDate &&
    value.scheduledEndDate &&
    value.scheduledEndDate < value.scheduledDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["scheduledEndDate"],
      message: "end_before_start",
    });
  }
  if (value.requiresFreight && value.freightDetails.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["freightDetails"],
      message: "freight_details_required",
    });
  }
}

export const orderIntakeSchema = z
  .object({
    siteId: databaseIdSchema,
    status: z.enum(ORDER_INITIAL_STATUSES).default("pendiente"),
    ...orderFields,
  })
  .superRefine(checkOrderFields);

/**
 * Edición de una orden ya creada: sin `siteId` (mudarla de punto la
 * convertiría en otra orden) y sin `status` — las transiciones pasan
 * exclusivamente por `transitionOrder`.
 */
export const orderEditSchema = z.object(orderFields).superRefine(checkOrderFields);

/**
 * Alta masiva: una orden por cada punto del proyecto que todavía no tenga.
 *
 * Sin `siteId` porque los puntos los resuelve el servidor recorriendo el
 * proyecto; el resto de los campos se aplica igual a todas. El título es el
 * mismo para el lote — la orden se distingue por su punto, no por el texto.
 */
export const orderBatchSchema = z
  .object({
    status: z.enum(ORDER_INITIAL_STATUSES).default("pendiente"),
    ...orderFields,
  })
  .superRefine(checkOrderFields);

export const orderAttachmentRegistrationSchema = z
  .array(
    z.object({
      storagePath: z.string().min(1).max(500),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z
        .string()
        .refine(
          (value) => value.startsWith("image/") || value === "application/pdf",
        ),
      sizeBytes: z.number().int().min(1).max(MAX_ORDER_ATTACHMENT_BYTES),
    }),
  )
  .min(1)
  .max(MAX_ORDER_ATTACHMENTS);

export type OrderIntake = z.infer<typeof orderIntakeSchema>;
export type OrderEdit = z.infer<typeof orderEditSchema>;
export type OrderBatch = z.infer<typeof orderBatchSchema>;
export type OrderAttachmentRegistration = z.infer<
  typeof orderAttachmentRegistrationSchema
>[number];

export function isAcceptedOrderFile(file: Pick<File, "type" | "size">) {
  const acceptedType =
    file.type.startsWith("image/") || file.type === "application/pdf";
  return acceptedType && file.size > 0 && file.size <= MAX_ORDER_ATTACHMENT_BYTES;
}
