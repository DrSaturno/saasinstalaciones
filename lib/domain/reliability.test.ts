import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE,
  WINDOW_DAYS,
  summarizeReliability,
  type ReliabilityEvent,
  type ReliabilityKind,
} from "@/lib/domain/reliability";

const HOY = "2026-09-01T12:00:00.000Z";

let n = 0;
function evento(
  kind: ReliabilityKind,
  diasAtras: number,
  over: Partial<ReliabilityEvent> = {},
): ReliabilityEvent {
  n += 1;
  return {
    id: `e${n}`,
    kind,
    occurredAt: new Date(
      new Date(HOY).getTime() - diasAtras * 86_400_000,
    ).toISOString(),
    orderId: `o${n}`,
    revertedAt: null,
    ...over,
  };
}

/** Cinco cumplimientos, para superar el mínimo de muestra. */
const base = () => [
  evento("order_completed", 10),
  evento("order_completed", 20),
  evento("order_completed", 30),
  evento("order_accepted", 40),
  evento("order_accepted", 50),
];

describe("índice de confiabilidad", () => {
  it("un historial limpio está en 100 sin tener que acumular méritos", () => {
    const r = summarizeReliability(base(), HOY);
    expect(r.score).toBe(100);
    expect(r.penalties).toEqual([]);
  });

  it("no afirma un nivel sin historia suficiente", () => {
    const r = summarizeReliability([evento("cancel_late", 5)], HOY);
    expect(r.score).toBeNull();
    expect(r.hasEnoughHistory).toBe(false);
    expect(r.sampleSize).toBeLessThan(MIN_SAMPLE);
  });

  it("recalcular con los mismos eventos da exactamente lo mismo", () => {
    // La propiedad que ADR-011 exige. Se prueba también con el orden de
    // entrada alterado: la reincidencia se cuenta cronológicamente, no por el
    // orden en que la base devolvió las filas.
    const eventos = [...base(), evento("cancel_late", 5), evento("cancel_late", 3)];
    const a = summarizeReliability(eventos, HOY);
    const b = summarizeReliability([...eventos].reverse(), HOY);
    expect(a.score).toBe(b.score);
    expect(a.sampleSize).toBe(b.sampleSize);
  });

  it("darse de baja EN PLAZO no cuesta nada", () => {
    const limpio = summarizeReliability(base(), HOY).score;
    const conBaja = summarizeReliability(
      [...base(), evento("cancel_in_notice", 5)],
      HOY,
    );
    expect(conBaja.score).toBe(limpio);
    // Pero el hecho aparece en el desglose: tiene que poder comprobar que no
    // le costó, no que se lo escondieron.
    expect(conBaja.counts.cancel_in_notice).toBe(1);
    expect(conBaja.penalties).toEqual([]);
  });

  it("una baja fuera de plazo pero JUSTIFICADA tampoco", () => {
    const limpio = summarizeReliability(base(), HOY).score;
    const conJustificada = summarizeReliability(
      [...base(), evento("cancel_justified", 5)],
      HOY,
    );
    expect(conJustificada.score).toBe(limpio);
    expect(conJustificada.penalties).toEqual([]);
  });

  it("responder una reprogramación dándose de baja tampoco penaliza", () => {
    const limpio = summarizeReliability(base(), HOY).score;
    expect(
      summarizeReliability([...base(), evento("reschedule_declined", 5)], HOY).score,
    ).toBe(limpio);
  });

  it("no contestar sí, y es lo único del flujo de reprogramación que pesa", () => {
    const conSilencio = summarizeReliability(
      [...base(), evento("reschedule_no_response", 5)],
      HOY,
    );
    expect(conSilencio.score).toBeLessThan(100);
    expect(conSilencio.penalties).toHaveLength(1);
  });

  it("la penalización es progresiva: la segunda falta pesa más que la primera", () => {
    const una = summarizeReliability([...base(), evento("cancel_late", 5)], HOY);
    const dos = summarizeReliability(
      [...base(), evento("cancel_late", 6), evento("cancel_late", 5)],
      HOY,
    );
    const caidaPrimera = 100 - (una.score ?? 0);
    const caidaTotal = 100 - (dos.score ?? 0);
    // Si fuera lineal, dos faltas costarían el doble. Cuestan más.
    expect(caidaTotal).toBeGreaterThan(caidaPrimera * 2);
  });

  it("una falta vieja pesa menos que la misma falta reciente", () => {
    const reciente = summarizeReliability([...base(), evento("cancel_late", 5)], HOY);
    const vieja = summarizeReliability([...base(), evento("cancel_late", 150)], HOY);
    expect(vieja.score).toBeGreaterThan(reciente.score ?? 0);
  });

  it("fuera de la ventana deja de contar: la penalización no es permanente", () => {
    const r = summarizeReliability(
      [...base(), evento("cancel_late", WINDOW_DAYS + 1)],
      HOY,
    );
    expect(r.score).toBe(100);
    expect(r.counts.cancel_late).toBe(0);
  });

  it("un evento revertido no pesa, pero el evento sigue existiendo", () => {
    const revertido = evento("cancel_late", 5, { revertedAt: HOY });
    const r = summarizeReliability([...base(), revertido], HOY);
    expect(r.score).toBe(100);
    expect(r.penalties).toEqual([]);
  });

  it("informa cuándo deja de pesar cada falta, que es lo que el requisito pide mostrar", () => {
    const r = summarizeReliability([...base(), evento("cancel_late", 5)], HOY);
    const falta = r.penalties[0];
    expect(falta.fadesOn > HOY).toBe(true);
    expect(falta.event.orderId).toBeTruthy();
  });

  it("nunca baja de 0 por muchas faltas que haya", () => {
    const muchas = Array.from({ length: 20 }, (_, i) => evento("cancel_late", i + 1));
    const r = summarizeReliability([...base(), ...muchas], HOY);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("ignora eventos con fecha futura", () => {
    const r = summarizeReliability([...base(), evento("cancel_late", -10)], HOY);
    expect(r.score).toBe(100);
  });
});
