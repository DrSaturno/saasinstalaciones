import { z } from "zod";

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const databaseId = (message: string) => z.string().regex(POSTGRES_UUID, message);
const title = z.string().trim().min(4, "El título es muy corto").max(120);
const description = z.string().trim().max(1200);
const slots = z.coerce.number().int().min(1).max(50);

const optionalCoordinate = (min: number, max: number) =>
  z
    .union([z.literal(""), z.coerce.number().min(min).max(max)])
    .default("")
    .transform((value) => (value === "" ? null : value));

/** Un `<select>` vacío manda "", no `undefined`: se normaliza a null. */
const optionalDatabaseId = (message: string) =>
  z
    .union([z.literal(""), databaseId(message)])
    .default("")
    .transform((value) => value || null);

export const createBroadcastSchema = z.object({
  // Una convocatoria puede nacer SIN proyecto: es la etapa previa, cuando la
  // empresa sale a buscar afuera y todavía no hay nada formalizado. En ese
  // caso el cliente se informa acá, porque sin proyecto no hay de dónde
  // heredarlo.
  projectId: optionalDatabaseId("Proyecto inválido"),
  clientId: optionalDatabaseId("Cliente inválido"),
  // La zona es la provincia, tal cual figura en la taxonomía y en la cobertura
  // del instalador: no se normaliza a mayúsculas o dejaría de matchear.
  zone: z.string().trim().min(2, "Ingresá una zona").max(80),
  title,
  description,
  slots,
  scheduledDate: z.union([z.literal(""), z.iso.date()]).default("").transform((value) => value || null),
  scheduledEndDate: z.union([z.literal(""), z.iso.date()]).default("").transform((value) => value || null),
  requirements: z.string().trim().max(1500).default(""),
  logisticsNotes: z.string().trim().max(1500).default(""),
  payVisible: z.boolean().default(false),
  payAmount: z.union([z.literal(""), z.coerce.number().min(0)]).default("").transform((value) => value === "" ? null : value),
  lat: optionalCoordinate(-90, 90),
  lng: optionalCoordinate(-180, 180),
}).refine(
  (value) => !value.scheduledEndDate || !value.scheduledDate || value.scheduledEndDate >= value.scheduledDate,
  { path: ["scheduledEndDate"] },
).refine(
  // Media coordenada no ubica nada: se piden las dos o ninguna.
  (value) => (value.lat === null) === (value.lng === null),
  { path: ["lng"] },
).refine(
  // Exactamente uno: con proyecto el cliente se hereda de él, y mandar los dos
  // abriría la puerta a que discrepen. Sin ninguno, la convocatoria quedaría
  // sin saber para quién es el trabajo.
  (value) => Boolean(value.projectId) !== Boolean(value.clientId),
  { path: ["clientId"], message: "Elegí un proyecto o un cliente, no ambos" },
);

export const updateBroadcastSchema = z.object({
  broadcastId: databaseId("Búsqueda inválida"),
  title,
  description,
  slots,
});

export const applicationSchema = z.object({
  broadcastId: databaseId("Búsqueda inválida"),
  message: z.string().trim().max(600).transform((value) => value || null),
  // Opcional a propósito: cuando la empresa ya publicó lo que paga, repetir
  // el número sería fricción. Cotizar es proponer otro, no un requisito.
  quotedAmount: z
    .union([z.literal(""), z.coerce.number().min(0).max(999_999_999_999.99)])
    .default("")
    .transform((value) => (value === "" ? null : value)),
});

export const resolveApplicationSchema = z.object({
  broadcastId: databaseId("Búsqueda inválida"),
  installerId: databaseId("Instalador inválido"),
  orderIds: z.array(databaseId("Orden inválida")).max(100),
});

export const formalizeProjectSchema = z.object({
  broadcastId: databaseId("Búsqueda inválida"),
  installerId: databaseId("Instalador inválido"),
  // Obligatorio SÓLO acá. En el alta normal de proyectos sigue siendo
  // opcional: una empresa que todavía no cargó coordinadores tiene que poder
  // crear su primer proyecto. Lo que no puede es formalizar un trabajo con
  // alguien de afuera sin tener quién lo coordine.
  coordinatorId: databaseId("Elegí un coordinador"),
  name: title,
});
