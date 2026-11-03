# Finanzas · implementación del rediseño

Estado: implementación local, con demo interactiva y pruebas sobre PostgreSQL aislado. La validación final con Auth, Storage y el esquema completo de un entorno Supabase de prueba es una instancia posterior al desarrollo local. No se aplicaron migraciones a bases reales.

## Revisar la aplicación

Desde la raíz de esta copia de Se Instala:

```powershell
pnpm dev --hostname 127.0.0.1 --port 3000
```

Abrir <http://127.0.0.1:3000/finance-preview>. No requiere credenciales. Usa las mismas pantallas del módulo y una base PostgreSQL PGlite con datos inventados. Los cambios duran durante la ejecución del servidor y pueden reiniciarse desde la pantalla. Los archivos adjuntos se representan con documentos de ejemplo; el PDF de Resumen se genera con los datos ficticios actuales y las fechas seleccionadas.

La ruta integrada es `/finance`: usa Supabase, la sesión de la aplicación, los permisos de la empresa y archivos privados. La vista de desarrollo devuelve 404 en producción y rechaza hosts remotos y escrituras desde otro origen.

## Documentos de SDD

- [Requisitos aprobados](requirements.md).
- [Diseño y decisiones de integración](design.md).
- [Tareas y trazabilidad de las comprobaciones](tasks.md).
- [Procedencia y versiones de las migraciones](migration-provenance.md).
- [Validación y pasos para staging](verification.md).

## Alcance

Resumen, Pagos, Cobros, Cheques y Órdenes y consultas. Se reutilizan las OTs y los proyectos de Operaciones; Finanzas no crea OTs. El módulo contempla gastos periódicos, sueldos por persona, facturas con varias OTs, pagos distribuidos, anticipos, comprobantes, historial, saldos a favor y cheques con acreditación o débito confirmados manualmente.

La integración reconoce tanto los importes de `main` como las tablas privadas y los ayudantes del trabajo operativo local existente. Este cambio no importa los demás cambios de esa rama ni modifica las carpetas anteriores.
