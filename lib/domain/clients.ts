import { z } from "zod";
import { FIELD, optionalEmail } from "@/lib/domain/field-rules";

/**
 * Límites de la ficha de un cliente, compartidos entre el formulario
 * (`client-dialog.tsx`) y la acción que la guarda.
 *
 * Vivían dentro de la acción, que como archivo `"use server"` sólo puede
 * exportar funciones: el formulario no tenía de dónde leerlos y no frenaba
 * nada. Teléfono, dirección y nombre de contacto usan ahora la regla común de
 * `FIELD` —antes eran más cortos acá que en la ficha de un local—.
 */
export const CLIENT_LIMITS = {
  // 150 lo fija también la base: `clients.name` tiene un check de 2 a 150.
  name: { min: 2, max: 150 },
  taxId: 40,
  contactName: FIELD.personName.max,
  email: FIELD.email.max,
  phone: FIELD.phone.max,
  address: FIELD.address.max,
  notes: 2000,
  website: 200,
  social: 100,
} as const;

export const clientInputSchema = z.object({
  name: z.string().trim().min(CLIENT_LIMITS.name.min).max(CLIENT_LIMITS.name.max),
  taxId: z.string().trim().max(CLIENT_LIMITS.taxId),
  contactName: z.string().trim().max(CLIENT_LIMITS.contactName),
  email: optionalEmail(),
  phone: z.string().trim().max(CLIENT_LIMITS.phone),
  address: z.string().trim().max(CLIENT_LIMITS.address),
  notes: z.string().trim().max(CLIENT_LIMITS.notes),
  // Texto libre, no URL: la gente escribe "@lamarca" o "instagram.com/lamarca"
  // indistintamente, y exigir un formato acá haría fallar el alta por una barra
  // de más. Normalizar a link es problema de la vista.
  website: z.string().trim().max(CLIENT_LIMITS.website),
  instagram: z.string().trim().max(CLIENT_LIMITS.social),
  youtube: z.string().trim().max(CLIENT_LIMITS.social),
  tiktok: z.string().trim().max(CLIENT_LIMITS.social),
});
