import { z } from "zod";

const title = z.string().trim().min(4, "El título es muy corto").max(120);
const description = z.string().trim().max(1200);
const slots = z.coerce.number().int().min(1).max(50);

export const createBroadcastSchema = z.object({
  projectId: z.string().uuid("Proyecto inválido"),
  zone: z
    .string()
    .trim()
    .min(2, "Ingresá una zona")
    .max(80)
    .transform((value) => value.toUpperCase()),
  title,
  description,
  slots,
});

export const updateBroadcastSchema = z.object({
  broadcastId: z.string().uuid("Búsqueda inválida"),
  title,
  description,
  slots,
});

export const applicationSchema = z.object({
  broadcastId: z.string().uuid("Búsqueda inválida"),
  message: z.string().trim().max(600).transform((value) => value || null),
});

export const resolveApplicationSchema = z.object({
  broadcastId: z.string().uuid("Búsqueda inválida"),
  installerId: z.string().uuid("Instalador inválido"),
  orderIds: z.array(z.string().uuid("Orden inválida")).max(100),
});
