import { z } from "zod";

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

const optionalUuid = z
  .union([z.literal(""), databaseIdSchema])
  .transform((value) => value || null);

const optionalAmount = z
  .union([
    z.literal(""),
    z.coerce.number().finite().min(0).max(999_999_999_999.99),
  ])
  .transform((value) => (value === "" ? null : value));

export const orderIntakeSchema = z
  .object({
    siteId: databaseIdSchema,
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(4_000).default(""),
    status: z.enum(ORDER_INITIAL_STATUSES).default("pendiente"),
    scheduledDate: optionalDate,
    scheduledEndDate: optionalDate,
    priority: z.enum(ORDER_PRIORITIES).default("media"),
    indoor: z.boolean().default(false),
    requiresFreight: z.boolean().default(false),
    freightDetails: z.string().trim().max(1_000).default(""),
    logisticsNotes: z.string().trim().max(2_000).default(""),
    amount: optionalAmount,
    installerId: optionalUuid,
  })
  .superRefine((value, context) => {
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
  });

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
export type OrderAttachmentRegistration = z.infer<
  typeof orderAttachmentRegistrationSchema
>[number];

export function isAcceptedOrderFile(file: Pick<File, "type" | "size">) {
  const acceptedType =
    file.type.startsWith("image/") || file.type === "application/pdf";
  return acceptedType && file.size > 0 && file.size <= MAX_ORDER_ATTACHMENT_BYTES;
}
