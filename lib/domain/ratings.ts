import { z } from "zod";

export const ratingInputSchema = z.object({
  orderId: z.string().uuid("Orden inválida"),
  stars: z.number().int().min(1, "Elegí al menos una estrella").max(5),
  comment: z
    .string()
    .trim()
    .max(1000, "El comentario no puede superar los 1000 caracteres")
    .transform((value) => value || null),
});

export type RatingInput = z.infer<typeof ratingInputSchema>;
