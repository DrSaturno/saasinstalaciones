# Requisitos

Trazan a **REQ-08.1..08.7** y **AC-08-A/B/C**. Cada uno con su estado real, verificado en código el 02-09-2026.

## Importación

1. Cargar una planilla y generar las fichas de locación. *(REQ-08.4)* — **Hecho.** Confirmación idempotente por `import_id`; el servidor reparsea el archivo original, nunca acepta filas armadas por el cliente.
2. Opción **claramente visible** de descargar la planilla base, y el flujo en el orden: descargar → completar → importar → generar. *(REQ-08.1)* — **Parcial.** El botón existe (`/api/site-template`) pero está **adentro** del diálogo de importar, no al lado de importar y exportar; hay que abrir el diálogo de importación para descubrirlo, que es el orden inverso al del requisito. Además se llama "Descargar planilla Excel", no "planilla base".
3. La interfaz diferencia importar de exportar. *(REQ-08.1)* — **Hecho.** Dos botones distintos en «Adm. instalaciones».

## Control de cantidad y diferencias

4. Mostrar informados, encontrados y diferencia antes de dar por finalizada la carga. *(REQ-08.2)* — **Hecho, y es el ejemplo textual del requisito.** `expected` sale de `project.planned_installations`, que es la cantidad que la empresa declaró para la campaña. El caso 50 contra 47 está cubierto, y el aviso funciona en las dos direcciones: si faltan y si sobran.
5. Contemplar duplicados. *(REQ-08.3)* — **Hecho.** Dentro de la planilla y contra el proyecto; reimportar no duplica.
6. Contemplar registros incompletos y locaciones no identificables. *(REQ-08.2)* — **Hecho.** Incompletas, coordenadas inválidas y fuera de zona.
7. Errores descargables con fila, campo, valor y causa. *(REQ-08.5)* — **Hecho.**

## Exportación

8. Exportar con estructura clara y utilizable. *(REQ-08.6)* — **Hecho.** XLSX paginado de a 1000, con contrato de round-trip **probado**: lo exportado vuelve a entrar por el lector sin pérdida ni duplicación.
9. Permitir seleccionar qué locaciones exportar. *(REQ-08.6)* — **Parcial.** Hoy exporta todas las activas del proyecto; no hay selección.

## Nombres de columna equivalentes

10. Reconocer que distintos clientes llaman distinto a lo mismo. — **Parcial.** El lector ya tiene alias: `sucursal`, `local`, `punto`, `sitio`, `estación` para el nombre; `dirección`, `domicilio`, `endereço`, `calle` para la dirección. **Faltan dos de los cinco ejemplos del pedido: "punto de venta" y "ubicación".**

## Formatos libres

11. Interpretar Excel de estructura arbitraria, PDF, Word. *(REQ-08.7)* — **No, y a propósito.** El propio pedido lo plantea como evolución futura. Es un flujo asistido distinto: sin escritura automática y con preview obligatorio, porque una interpretación automática que se equivoca en silencio es peor que pedir la planilla.
