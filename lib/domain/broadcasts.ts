import { z } from "zod";
import { LATITUDE, LONGITUDE, MONEY_MAX } from "@/lib/domain/field-rules";

/**
 * Límites de los formularios de convocatorias, compartidos con
 * `create-broadcast-dialog`, `broadcast-card`, `job-card` y
 * `formalize-project-dialog`.
 *
 * Los mensajes de error ya no viven acá: estaban escritos en español dentro
 * del esquema («El título es muy corto»), así que una persona en portugués
 * los habría visto igual —y encima nunca llegaban a la pantalla, porque la
 * acción respondía «Datos inválidos»—. Ahora los traduce `invalidFieldMessage`.
 */
export const BROADCAST_LIMITS = {
  title: { min: 4, max: 120 },
  description: 1200,
  slots: { min: 1, max: 50 },
  zone: { min: 2, max: 80 },
  requirements: 1500,
  logisticsNotes: 1500,
  applicationMessage: 600,
} as const;

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const databaseId = () => z.string().regex(POSTGRES_UUID);
const title = z.string().trim().min(BROADCAST_LIMITS.title.min).max(BROADCAST_LIMITS.title.max);
const description = z.string().trim().max(BROADCAST_LIMITS.description);
const slots = z.coerce.number().int().min(BROADCAST_LIMITS.slots.min).max(BROADCAST_LIMITS.slots.max);

const optionalCoordinate = (range: { min: number; max: number }) =>
  z
    .union([z.literal(""), z.coerce.number().min(range.min).max(range.max)])
    .default("")
    .transform((value) => (value === "" ? null : value));

/** Un `<select>` vacío manda "", no `undefined`: se normaliza a null. */
const optionalDatabaseId = () =>
  z
    .union([z.literal(""), databaseId()])
    .default("")
    .transform((value) => value || null);

export const createBroadcastSchema = z.object({
  // Una convocatoria puede nacer SIN proyecto: es la etapa previa, cuando la
  // empresa sale a buscar afuera y todavía no hay nada formalizado. En ese
  // caso el cliente se informa acá, porque sin proyecto no hay de dónde
  // heredarlo.
  projectId: optionalDatabaseId(),
  clientId: optionalDatabaseId(),
  // La zona es la provincia, tal cual figura en la taxonomía y en la cobertura
  // del instalador: no se normaliza a mayúsculas o dejaría de matchear.
  zone: z.string().trim().min(BROADCAST_LIMITS.zone.min).max(BROADCAST_LIMITS.zone.max),
  title,
  description,
  slots,
  scheduledDate: z.union([z.literal(""), z.iso.date()]).default("").transform((value) => value || null),
  scheduledEndDate: z.union([z.literal(""), z.iso.date()]).default("").transform((value) => value || null),
  requirements: z.string().trim().max(BROADCAST_LIMITS.requirements).default(""),
  logisticsNotes: z.string().trim().max(BROADCAST_LIMITS.logisticsNotes).default(""),
  payVisible: z.boolean().default(false),
  // Sin techo, un monto de más de doce cifras pasaba y lo rechazaba la columna
  // (`numeric(14, 2)`) con un error genérico.
  payAmount: z
    .union([z.literal(""), z.coerce.number().min(0).max(MONEY_MAX)])
    .default("")
    .transform((value) => (value === "" ? null : value)),
  lat: optionalCoordinate(LATITUDE),
  lng: optionalCoordinate(LONGITUDE),
}).refine(
  (value) => !value.scheduledEndDate || !value.scheduledDate || value.scheduledEndDate >= value.scheduledDate,
  { path: ["scheduledEndDate"], message: "endBeforeStart" },
).refine(
  // Media coordenada no ubica nada: se piden las dos o ninguna.
  (value) => (value.lat === null) === (value.lng === null),
  { path: ["lng"], message: "coordinatePair" },
).refine(
  // Exactamente uno: con proyecto el cliente se hereda de él, y mandar los dos
  // abriría la puerta a que discrepen. Sin ninguno, la convocatoria quedaría
  // sin saber para quién es el trabajo.
  (value) => Boolean(value.projectId) !== Boolean(value.clientId),
  { path: ["clientId"], message: "projectOrClient" },
);

export const updateBroadcastSchema = z.object({
  broadcastId: databaseId(),
  title,
  description,
  slots,
});

export const applicationSchema = z.object({
  broadcastId: databaseId(),
  message: z
    .string()
    .trim()
    .max(BROADCAST_LIMITS.applicationMessage)
    .transform((value) => value || null),
  // Opcional a propósito: cuando la empresa ya publicó lo que paga, repetir
  // el número sería fricción. Cotizar es proponer otro, no un requisito.
  quotedAmount: z
    .union([z.literal(""), z.coerce.number().min(0).max(MONEY_MAX)])
    .default("")
    .transform((value) => (value === "" ? null : value)),
});

export const resolveApplicationSchema = z.object({
  broadcastId: databaseId(),
  installerId: databaseId(),
  orderIds: z.array(databaseId()).max(100),
});

export const formalizeProjectSchema = z.object({
  broadcastId: databaseId(),
  installerId: databaseId(),
  // Obligatorio SÓLO acá. En el alta normal de proyectos sigue siendo
  // opcional: una empresa que todavía no cargó coordinadores tiene que poder
  // crear su primer proyecto. Lo que no puede es formalizar un trabajo con
  // alguien de afuera sin tener quién lo coordine.
  coordinatorId: databaseId(),
  name: title,
});
