import { describe, expect, it } from "vitest";
import { ratingInputSchema } from "@/lib/domain/ratings";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

describe("ratingInputSchema", () => {
  it("acepta de 1 a 5 estrellas", () => {
    for (let stars = 1; stars <= 5; stars += 1) {
      expect(
        ratingInputSchema.safeParse({ orderId: ORDER_ID, stars, comment: "" })
          .success,
      ).toBe(true);
    }
  });

  it("rechaza puntajes fuera del rango", () => {
    expect(
      ratingInputSchema.safeParse({ orderId: ORDER_ID, stars: 0, comment: "" })
        .success,
    ).toBe(false);
    expect(
      ratingInputSchema.safeParse({ orderId: ORDER_ID, stars: 6, comment: "" })
        .success,
    ).toBe(false);
  });

  it("normaliza un comentario vacío a null", () => {
    const parsed = ratingInputSchema.parse({
      orderId: ORDER_ID,
      stars: 5,
      comment: "   ",
    });
    expect(parsed.comment).toBeNull();
  });

  it("rechaza comentarios de más de 1000 caracteres", () => {
    expect(
      ratingInputSchema.safeParse({
        orderId: ORDER_ID,
        stars: 5,
        comment: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });
});
