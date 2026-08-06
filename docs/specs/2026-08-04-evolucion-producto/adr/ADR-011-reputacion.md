# ADR-011 — Reputación y confiabilidad explicables

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisión relacionada: DEC-08

## Decisión

Confiabilidad de compromisos y reputación de desempeño son proyecciones separadas sobre eventos versionados. Cada fórmula guarda versión, ventana, mínimo de muestra y desglose explicable. Cancelaciones justificadas, reprogramaciones ajenas y eventos revertidos no dañan el resultado.

La primera entrega opera en shadow mode: sólo operadores autorizados y el propio instalador ven el cálculo y pueden revisar/apelar. Una vista pública futura sólo mostrará agregados y badges con muestra suficiente; nunca motivos sensibles ni historial por empresa.

## Consecuencias y verificación

No se activa una penalización visible sin decisión explícita posterior y evidencia comparativa. Recalcular con los mismos eventos produce el mismo resultado.
