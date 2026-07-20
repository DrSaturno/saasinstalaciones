import { z } from "zod";

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const databaseId = (message: string) => z.string().regex(POSTGRES_UUID, message);
const title = z.string().trim().min(4, "El título es muy corto").max(120);
const description = z.string().trim().max(1200);
const slots = z.coerce.number().int().min(1).max(50);

export const createBroadcastSchema = z.object({
  projectId: databaseId("Proyecto inválido"),
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
  broadcastId: databaseId("Búsqueda inválida"),
  title,
  description,
  slots,
});

export const applicationSchema = z.object({
  broadcastId: databaseId("Búsqueda inválida"),
  message: z.string().trim().max(600).transform((value) => value || null),
});

export const resolveApplicationSchema = z.object({
  broadcastId: databaseId("Búsqueda inválida"),
  installerId: databaseId("Instalador inválido"),
  orderIds: z.array(databaseId("Orden inválida")).max(100),
});
