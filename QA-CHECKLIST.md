# Instala Pro — Checklist de repaso general

Documento de trabajo para la recorrida completa de la app. Se completa tildando
y anotando abajo de cada ítem que falle. El resultado alimenta el plan de
correcciones.

---

## Antes de empezar

- [ ] **Prefijo `QA-` en todo lo que crees.** Local y producción apuntan a la
      **misma base de Supabase**, así que los datos de prueba quedan en la base
      real se pruebe donde se pruebe. Nombrá clientes, proyectos y locaciones
      como `QA-loquesea` para poder borrarlos después de un saque.
- [ ] Tener a mano los tres usuarios de prueba (están en `PROGRESS.md`):
      gerente, instalador y el maestro. El coordinador hay que crearlo invitando
      desde Equipo si todavía no existe uno.
- [ ] Para la parte de instalador, usar **un teléfono real**, no el navegador de
      escritorio angostado. La PWA y el offline solo se prueban de verdad ahí.

### Cómo anotar cada hallazgo

Cinco datos, una línea cada uno. No hace falta prolijidad ni ordenarlos por
importancia — eso se hace después.

```
[rol] URL
Esperaba: ...
Pasó: ...
Bug / Mejora
Bloquea / Molesta
```

---

## Recorrida A — Gerente (`company_manager`)

El flujo entero de la vida de un proyecto, en orden. La idea es no saltar pasos:
la mayoría de los problemas aparecen en las costuras entre un módulo y el
siguiente.

### A1. Entrada y tablero — `/login`, `/dashboard`

- [ ] Login con usuario y contraseña correctos
- [ ] Login con contraseña incorrecta: ¿el mensaje de error se entiende?
- [ ] Las seis métricas de arriba muestran números coherentes con la realidad
- [ ] Las alertas del pulso operativo son clickeables y llevan a donde dicen
- [ ] Las acciones rápidas abren el formulario correcto
- [ ] El semáforo de proyectos (en término / en riesgo / atrasado / pausado)
      coincide con lo que ves en `/projects`
- [ ] Agenda y capacidad de los próximos 7 días
- [ ] El mapa carga y los pines abren la orden correcta
- [ ] Clima por zona
- [ ] Los nombres de instaladores abren el chat
- [ ] Estado de Google Calendar (hoy debería decir "pendiente de configuración")

### A2. Clientes — `/clients`, `/clients/[id]`

- [ ] Crear un cliente `QA-Cliente`
- [ ] Editar sus datos de contacto
- [ ] Toggle **Lista / Tablero** ⚠️ *(nunca se probó a mano)*
- [ ] Buscar y filtrar
- [ ] Ficha del cliente: proyectos y puntos vinculados
- [ ] Ficha del cliente: histórico de órdenes por locación

### A3. Proyectos — `/projects`, `/projects/[id]`

- [ ] Crear proyecto `QA-Proyecto` con cliente de agenda, coordinador, país,
      zonas, cantidad contratada, fechas y modalidad de cobro
- [ ] Toggle **Lista / Tablero** ⚠️ *(nunca se probó a mano)*
- [ ] Editar el proyecto: cambiar modalidad de cobro sin perder importes
- [ ] Intentar cambiar país o una zona que ya tiene instalaciones: debería
      impedirlo
- [ ] **Adm. instalaciones** → ajustar cantidad contratada
- [ ] **Adm. instalaciones** → agregar una locación a mano
- [ ] **Adm. instalaciones** → importar CSV (probá con el modelo descargable)
- [ ] **Adm. instalaciones** → importar CSV con latitud/longitud
- [ ] **Adm. instalaciones** → importar un CSV roto a propósito: ¿avisa bien?
- [ ] **Generar órdenes**: crea primero las locaciones pendientes y después solo
      las órdenes faltantes
- [ ] Generar órdenes dos veces seguidas: no debería duplicar nada
- [ ] % de avance del proyecto
- [ ] Archivar una locación con historial / eliminar una vacía

### A4. Ficha de locación — `/projects/[id]/sites/[siteId]`

- [ ] Completar contacto, horarios, acceso, estacionamiento, datos técnicos,
      riesgos y notas
- [ ] Cargar coordenadas y abrir en Google Maps
- [ ] Subir fotos y un PDF; verificar que se ven después de recargar
- [ ] Listado de todas las órdenes de esa locación, enlazables

### A5. Órdenes — `/orders`, `/orders/[id]`

- [ ] Crear una orden individual con la ficha completa (título, fechas,
      prioridad, techado, descripción, logística, flete, importe, adjuntos)
- [ ] Asignar un instalador responsable del roster activo
- [ ] Filtros: estado, zona, instalador, rango de fechas, importe mayor/menor
- [ ] Búsqueda por número de orden
- [ ] Que la tabla no se trabe con muchas filas (está virtualizada)
- [ ] Numeración correlativa por región (`AMBA-…`, `INT-…`, `BR-SP-…`)
- [ ] Detalle de orden: historial de cambios completo
- [ ] Detalle de orden: acciones rápidas
- [ ] Reprogramar una orden y ver que quede registrado
- [ ] Registrar una incidencia (tipo, prioridad, detalle, revisita)
- [ ] Resolver esa incidencia
- [ ] Editar una orden ya creada
- [ ] Adjuntos: se ven con URL firmada y no se filtran a quien no corresponde

### A6. Equipo — `/team`

- [ ] Invitar un instalador por email
- [ ] Invitar un coordinador
- [ ] Copiar el link manual de invitación
- [ ] **Ascender instalador a coordinador** ⚠️ *(nunca se probó a mano)*
- [ ] Quitar a alguien del equipo: libera sus órdenes no terminadas
- [ ] Reactivar a alguien
- [ ] Panel de coordinadores
- [ ] Panel de instaladores indispuestos, con período y justificación
- [ ] **Aprobar** una ausencia y verificar que recién ahí bloquea la agenda
- [ ] **Rechazar** una ausencia con nota
- [ ] El contador de ausencias pendientes es visible

### A7. Bolsa de trabajo — `/broadcasts`

- [ ] Crear una búsqueda con fechas, requisitos, logística y paga
- [ ] Toggle para mostrar/ocultar la paga
- [ ] Ver el pipeline de candidatos
- [ ] Aceptar un candidato: se suma al roster y se le asignan órdenes
- [ ] Cerrar una búsqueda
- [ ] Que la búsqueda **no** se le muestre a quien ya está en el equipo

### A8. Anuncios

- [ ] Publicar un anuncio con público filtrado
- [ ] Verificar que le llega a quien corresponde y a nadie más

### A9. Mensajería — `/messages`

- [ ] Abrir una conversación con un instalador ⚠️ *(nunca se probó a mano)*
- [ ] Mandar un mensaje y ver que llega en tiempo real
- [ ] Adjuntar un archivo
- [ ] Que el coordinador vea la misma conversación
- [ ] Marcado de leído / no leído

### A10. Finanzas — `/finance`

- [ ] Filtros por semana, quincena, mes, semestre y fechas personalizadas
- [ ] Que **todos** los paneles respeten el mismo período elegido
- [ ] Separación ARS / BRL
- [ ] Contratado, realizado, pendiente, ticket promedio
- [ ] Evolución mensual y cortes por proyecto, zona e instalador
- [ ] Exportar CSV y abrirlo en Excel (ojo con el separador `;`)

### A11. Configuración — `/settings`

- [ ] Cambiar contraseña
- [ ] Cambiar idioma a portugués y verificar que persiste al recargar
- [ ] Volver a español

---

## Recorrida B — Coordinador

Acá lo importante no es lo que funciona sino **lo que no debería poder ver**. Si
algo de esta lista se ve, es un problema de seguridad, no de UI.

- [ ] **Finanzas no aparece en el menú** y entrar a mano a `/finance` lo rebota
- [ ] No ve importes ni cobros en ninguna pantalla de órdenes o proyectos
- [ ] Solo ve **sus** proyectos, órdenes, locaciones e incidencias
- [ ] Entrar a mano a la URL de un proyecto ajeno: debería rebotar
- [ ] Puede operar normalmente sobre lo suyo (crear órdenes, asignar, resolver
      incidencias)
- [ ] Ve la mensajería completa
- [ ] Ve la bolsa de trabajo de sus proyectos
- [ ] El menú lateral no muestra opciones que después le van a rebotar

---

## Recorrida C — Instalador (en el teléfono)

- [ ] Instalar la PWA desde el navegador del teléfono
- [ ] Que abra en `/tasks` al iniciarla desde el ícono
- [ ] **Inicio** — `/home`: que muestre lo del día
- [ ] **Aceptar una orden** ⚠️ *(nunca se probó a mano)*
- [ ] **Mis órdenes** — `/tasks`: orden de la lista por accionabilidad
- [ ] Detalle de orden — `/tasks/[id]`: ver adjuntos y ficha de la locación
- [ ] "Cómo llegar" abre Google Maps
- [ ] Iniciar trabajo
- [ ] Cargar un avance con foto
- [ ] Cargar un bloqueo
- [ ] Marcar terminado
- [ ] **Mi ruta** — `/route`
- [ ] **Bolsa** — `/jobs`: postularse a una búsqueda
- [ ] **Perfil** — `/profile`: promedio de estrellas, zonas, reseñas
- [ ] Cargar una ausencia desde el inicio
- [ ] Campanita de notificaciones
- [ ] Activar notificaciones push y confirmar que llega una de verdad
      *(pendiente viejo)*

### C-bis. Offline (modo avión)

- [ ] Con el teléfono en modo avión: cargar un avance
- [ ] Que la UI responda igual (estado optimista) y muestre el indicador de
      sincronización
- [ ] Sacar el modo avión y verificar que sube solo
- [ ] Sacar una foto sin señal y confirmar que se sube después
- [ ] Repetir la misma acción dos veces sin señal: **no debe duplicarse**

---

## Recorrida D — Tablero maestro (`platform_admin`)

- [ ] `/master`: métricas globales
- [ ] `/master/companies`: alta de empresa nueva con su primer gerente
- [ ] Contraseña temporal de un solo uso
- [ ] Suspender una empresa y verificar que su gerente no puede entrar
- [ ] Reactivarla
- [ ] Que el gerente nuevo no vea datos de otra empresa

---

## Recorrida E — Público

- [ ] Landing `/` en escritorio y en teléfono
- [ ] Selector de idioma en la landing
- [ ] Los CTA llevan a donde dicen
- [ ] `/invite/[token]` con un instalador **sin cuenta**: muestra el formulario
      de alta
- [ ] Completar esa alta y llegar a `/tasks`
- [ ] `/invite/[token]` con alguien que **ya tiene cuenta**
- [ ] Token inválido o vencido: mensaje claro
- [ ] Una URL que no existe: el 404 se ve bien y en el idioma correcto
- [ ] Recuperar contraseña

---

## Transversal — unificar criterio

Esto **no** se anota como bug de una pantalla. Es comparar la misma cosa en
varios lados y anotar dónde difiere. Se arregla todo junto al final.

- [ ] **Filtros:** ¿se aplican solos o hay que apretar un botón? ¿Igual en todos
      los módulos?
- [ ] **Búsqueda:** ¿el campo está siempre en el mismo lugar? ¿busca por lo
      mismo?
- [ ] **Botones de formulario:** ¿siempre dicen lo mismo (Guardar / Cancelar) y
      están del mismo lado?
- [ ] **Confirmaciones:** ¿qué acciones piden confirmar y cuáles no? ¿Debería
      ser parejo?
- [ ] **Estados vacíos:** ¿todos tienen texto y sugerencia de qué hacer, o
      algunos quedan en blanco?
- [ ] **Cargando:** ¿todos muestran esqueleto, o algunos saltan?
- [ ] **Errores:** ¿el mensaje aparece siempre en el mismo lugar y con el mismo
      tono?
- [ ] **Fechas:** ¿mismo formato en toda la app?
- [ ] **Plata:** ¿mismo formato y símbolo de moneda en todos lados?
- [ ] **Colores de estado:** ¿el mismo estado tiene el mismo color siempre?
- [ ] **Tablas:** ¿ordenables en todos lados o solo en algunos?
- [ ] **Volver:** ¿cómo se sale de cada ficha? ¿Es consistente?
- [ ] **Menú lateral:** ¿algún ítem lleva a una pantalla vacía o a un rebote?
- [ ] **Nombres:** ¿la misma cosa se llama igual en todas las pantallas?

### Idiomas

- [ ] Recorrer en **portugués** las pantallas principales
- [ ] Buscar textos que quedaron en español
- [ ] Verificar que las fechas y números también cambien

### Responsive

- [ ] Área de empresa en teléfono: que no haya barra de scroll horizontal
- [ ] Menú lateral colapsable en escritorio y overlay en teléfono
- [ ] Tablas anchas en pantalla chica

---

## Hallazgos

> Anotá acá abajo, agrupando por módulo. Sin formato, como salga.

### Tablero

### Clientes

### Proyectos

### Órdenes

### Equipo

### Bolsa

### Mensajería

### Finanzas

### Instalador

### Maestro

### Público

### Unificar criterio

