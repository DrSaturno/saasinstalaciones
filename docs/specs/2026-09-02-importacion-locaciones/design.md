# Diseño

## Por qué esta spec es corta

Los dos puntos anteriores empezaron con tablas construidas y sin usar. Acá no: el importador está entero, conectado y con tests. Así que esta spec no diseña un módulo — anota tres cosas de tamaños muy distintos que quedaron afuera, y sobre todo **por qué la tercera no debe hacerse como las otras dos**.

## El ajuste de UX

El requisito describe un orden concreto:

> Descargar planilla base → Completar información → Importar planilla → Generar fichas

Hoy la descarga vive adentro del diálogo de importación. Funciona, pero para encontrarla hay que abrir la importación primero — el paso 3 antes del paso 1. Alguien que nunca importó no tiene forma de saber que la plantilla existe hasta que se mete en el flujo que la necesita.

Sacarla al mismo nivel que Importar y Exportar es un botón movido de lugar, no un rediseño.

## Los alias

`COLUMN_ALIASES` en `lib/domain/site-import.ts` ya reconoce `sucursal`, `local`, `punto`, `sitio` y `estación`. Faltan dos de los cinco ejemplos del pedido: **punto de venta** y **ubicación**.

Detalle a mirar antes de agregarlos: los alias existentes están sin acento y en una sola palabra (`direccion`, `estacion`), lo que sugiere que el encabezado se normaliza. Un alias con espacio como "punto de venta" puede no matchear si la normalización colapsa o parte por espacios. Hay que leer cómo normaliza antes de sumar, no después.

## Los formatos libres, y por qué van aparte

Esto es lo único que merece pensarse.

El importador de hoy es **determinista**: la planilla tiene una estructura conocida, el lector la valida, y lo que no encaja se reporta como error con fila y causa. Esa es su garantía — si importó, importó bien, y si no, dice exactamente qué pasó.

Interpretar un PDF o un Excel de estructura arbitraria es lo contrario: es adivinar. Y una adivinanza que se equivoca en silencio es **peor que pedir la planilla**, porque crea fichas de locación mal armadas que después alguien tiene que descubrir y corregir a mano — justo el trabajo manual que todo este punto quiere eliminar.

Por eso `REQ-08.7` pide flujo asistido separado, preview obligatorio y cero escritura automática. La interpretación propone; la persona confirma. Mezclarlo con el importador determinista le sacaría la garantía a los dos.

Y antes de construir el intérprete conviene hacer lo que el propio pedido sugiere: **juntar los archivos que los clientes ya mandaron** y sacar los patrones reales. Diseñar el reconocedor contra formatos supuestos es la forma más rápida de acertarle a casos que nadie tiene y errarle a los que llegan todos los días.

## Fuera de alcance

La planilla genérica oficial para mandar a clientes es una decisión de negocio y de marca, no de código: la plantilla que hoy baja `/api/site-template` ya cumple esa función técnica.
