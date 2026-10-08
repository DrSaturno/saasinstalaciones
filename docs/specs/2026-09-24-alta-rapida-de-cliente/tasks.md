# Tareas

- [x] **CLIALTA-T-01** — `saveClient` devuelve `{ id, name }` del cliente guardado.
  → CLIALTA-DEC-02
- [x] **CLIALTA-T-02** — `ClientDialog` en modo controlado (`open`, `onOpenChange`, `onSaved`).
  → CLIALTA-DEC-01
- [x] **CLIALTA-T-03** — `ProjectFormFields`: selector controlado, opción «Crear cliente nuevo…»,
  selección automática al guardar, sólo para quien puede crear clientes.
  → CLIALTA-R1.*, CLIALTA-R2.*, CLIALTA-DEC-03
- [x] **CLIALTA-T-04** — Cadena `CreateProject.newClient` en `messages/es.json` y `pt.json`.
- [x] **CLIALTA-T-05** — `components/company/project-form-fields.test.tsx` (6 pruebas: opción
  visible, oculta sin permiso, abrir sin cambiar valor, cancelar, guardar y elegir, error).
  Verificada con una mutación: si se quita la selección automática, la prueba correspondiente
  falla. → AC-CLIALTA-A/B/C
- [x] **CLIALTA-T-06** — `pnpm type-check`, `pnpm lint`, `pnpm test` (587) en verde.
- [ ] **CLIALTA-T-07** — Verificación visual con un gerente de Demo: crear un cliente desde
  «Nuevo proyecto» (escritorio y teléfono), cancelar, error de nombre repetido, y que el
  proyecto se cree con el cliente nuevo.
