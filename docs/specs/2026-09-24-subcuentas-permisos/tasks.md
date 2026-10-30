# Tareas

Orden estricto. Nada llega a producción sin autorización explícita y sin haberse probado en Demo.

## Fase 0 — Pruebas primero (pgTAP)

- [x] **SUBCTA-T-01** — `supabase/tests/company_staff.test.sql`: `profiles.is_owner` default true;
  una subcuenta opera proyectos/órdenes igual que el dueño; sin permiso no ve
  `company_staff_permissions`/importes/no puede guardar configuración; el dueño activa un permiso y
  se refleja sin recrear sesión; una subcuenta con los dos permisos no puede invitar ni leer otras
  subcuentas; el dueño de otra empresa no alcanza nada; `accept_company_staff_invitation` crea el
  permiso pedido y marca la invitación aceptada; falla si el rol no es `company_staff`, si venció o
  si el email no coincide. → AC-SUBCTA-A..F — 22 assertions, verificadas contra Demo.

## Fase 1 — Migración (Demo)

- [x] **SUBCTA-T-02** — `profiles.is_owner boolean not null default true`. → DEC-01
- [x] **SUBCTA-T-03** — `handle_new_user` lee `is_owner` de `raw_app_meta_data` (default true).
  → DEC-01
- [x] **SUBCTA-T-04** — `auth_is_company_owner(company_id)`. → DEC-03
- [x] **SUBCTA-T-05** — Tabla `company_staff_permissions` + RLS + trigger de validación del
  `user_id` objetivo. → DEC-02
- [x] **SUBCTA-T-06** — `auth_can_see_commercials` extendida (bloque 8). → DEC-04
- [x] **SUBCTA-T-07** — `set_company_min_completion_photos` extendida. → DEC-05
- [x] **SUBCTA-T-08** — `invitations.role` admite `company_staff`; columnas
  `staff_can_manage_finance`, `staff_can_manage_settings`. → DEC-06
- [x] **SUBCTA-T-09** — `invitations_manager_all` e `invitations_coordinator_read` tensadas para
  `company_staff` (implementado como `invitations_team_all` + `invitations_staff_owner_all`). → DEC-06
- [x] **SUBCTA-T-10** — `accept_company_staff_invitation(p_token)`. → DEC-06

Migración `20260924000002_company_staff_accounts.sql` aplicada a Demo (krxewmfauohixmmzsvkp).

## Fase 2 — Código

- [x] **SUBCTA-T-11** — `CurrentUser` (`lib/auth.ts`): suma `isOwner`, `canManageFinance`,
  `canManageSettings`; `getCurrentUser()` los resuelve.
- [x] **SUBCTA-T-12** — `lib/actions/invite-signup.ts`: `signUpCompanyStaff`. → DEC-06
- [x] **SUBCTA-T-13** — `components/invite/staff-signup-form.tsx`;
  `app/invite/[token]/page.tsx` rama por `company_staff`. → DEC-07
- [x] **SUBCTA-T-14** — `lib/actions/company-staff.ts`: `inviteCompanyStaff`,
  `updateCompanyStaffPermissions`; reutilizar `cancelInvitation` existente para cancelar la
  invitación de una subcuenta (la RLS ya la limita al dueño). → DEC-06
- [x] **SUBCTA-T-15** — `lib/data/company-staff.ts`: lista de subcuentas de la empresa con sus
  permisos; `fetchPendingInvitations` filtra explícito a `installer`/`coordinator`.
- [x] **SUBCTA-T-16** — UI en `/team`: sección «Personal administrativo» (lista + invitar + toggles
  de permiso), visible sólo si `user.isOwner`. → DEC-08
- [x] **SUBCTA-T-17** — `/finance`: redirige también si es subcuenta sin `canManageFinance`.
  `/settings`: oculta el formulario de configuración si es subcuenta sin `canManageSettings`.
  → DEC-08
- [x] **SUBCTA-T-18** — Tipos de base (a mano hasta poder regenerar) y cadenas es/pt.

## Fase 3 — Verificación

- [x] **SUBCTA-T-19** — `pnpm type-check`, `pnpm lint`, `pnpm test` (643 tests, incluye
  `lib/actions/company-staff.test.ts` con 5 casos), `pnpm build` — los cuatro en verde.
- [x] **SUBCTA-T-20** — pgTAP relacionado verificado en Demo con el arnés manual de diagnóstico:
  `installer_finance` (8/8 aserciones de comportamiento, sigue siendo el gerente **dueño** quien
  pasa), `order_pricing_privacy` (24/24), `rpc_execute_hardening` (15/15 — la RPC nueva y
  `auth_is_company_owner` no aparecen en la superficie de `anon`). Cero regresiones.
- [ ] **SUBCTA-T-21** — Verificación visual (Nicolás). Sumar a `docs/PENDIENTES_NICOLAS.md`.

## Fase 4 — Producción (requiere autorización explícita)

- [ ] **SUBCTA-T-22** — Backup confirmado, aplicar la migración, desplegar.
