# Diseño

## Dirección visual

Ilustración isométrica 3D, luminosa y profesional: un instalador termina una marquesina azul desde una plataforma segura. Un vehículo de servicio, un celular con tarea completada y una ruta punteada conectan el trabajo físico con la coordinación digital.

La paleta usa azul Se Instala, celeste, lavanda y crema sobre un fondo blanco frío. No contiene texto, marcas de terceros ni elementos decorativos que compitan con el mensaje.

## Integración

- Archivo público: `/images/invitation-email-hero.jpg`.
- Dimensiones: 1120 × 560 px para visualización retina a 560 px.
- Peso objetivo: menos de 100 KB.
- La URL absoluta se deriva de `APP_URL` mediante `applicationOrigin()`.
- Solo la invitación de instaladores incorpora el encabezado; la activación del responsable de empresa conserva su plantilla actual.
- El HTML usa ancho fluido, dimensiones declaradas, `alt` localizado y fondo de respaldo.
