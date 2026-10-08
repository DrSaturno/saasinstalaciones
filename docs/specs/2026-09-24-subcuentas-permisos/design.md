# Diseño

## SUBCTA-DEC-01 — La subcuenta ES un `company_manager`, distinguido por `profiles.is_owner`

No se crea un rol nuevo. `profiles` gana `is_owner boolean not null default true`. El dueño
(creado hoy por el tablero maestro) tiene `is_owner = true`; una subcuenta nace con `is_owner =
false`, mismo `role = 'company_manager'` y mismo `company_id`.

**Por qué:** toda la superficie operativa (~30 políticas RLS, ~27 acciones de servidor) ya concede
acceso completo a `auth_role() = 'company_manager' and company_id = auth_company()`. Con esto,
SUBCTA-R2.1 (opera todo igual que el dueño) sale **gratis**, sin tocar ni una de esas políticas.
La alternativa —un rol `company_staff` separado— exigiría revisar y extender cada una de esas ~30
políticas para incluirlo, con el riesgo de olvidar alguna y dejar a una subcuenta bloqueada donde no
debería, o de agregarla mal y abrir algo que no debía. `default true` dado a la columna nueva deja
a todo `company_manager` existente como dueño sin backfill aparte (SUBCTA-R2... AC-F).

**Consecuencia asumida:** una subcuenta pasa el mismo `auth_role() = 'company_manager'` que el
dueño en todos lados. Las tres excepciones (SUBCTA-R2.2–R2.4) se resuelven con controles propios,
no reescribiendo las políticas operativas.

## SUBCTA-DEC-02 — Permisos: una tabla, dos columnas, sólo para subcuentas

`company_staff_permissions (user_id pk → profiles, company_id, can_manage_finance boolean default
false, can_manage_settings boolean default false, granted_by, created_at, updated_at)`. Existe una
fila por subcuenta; el dueño no tiene fila (su permiso es implícito y total). Un trigger valida que
el `user_id` sea un `company_manager` con `is_owner = false` de esa misma empresa: no se puede
«dar permiso de finanzas» a un instalador ni a un dueño por error.

**Por qué no dos columnas nuevas en `profiles`:** habría que revocar `UPDATE` de esas columnas para
que una subcuenta no se las autoconceda, mientras el resto de `profiles` (nombre, teléfono) sigue
siendo editable por su dueño. Aislarlas en una tabla propia, con su propia política, es más simple
de razonar y de auditar (`granted_by`, `updated_at`).

## SUBCTA-DEC-03 — `auth_is_company_owner`: el único lugar que decide «dueño o no»

```sql
create function auth_is_company_owner(p_company_id uuid) returns boolean as $$
  select auth_is_company_manager(p_company_id)
     and coalesce((select is_owner from profiles where id = auth.uid()), false)
$$;
```

Usada en exactamente cuatro lugares: las políticas de `company_staff_permissions`, la parte de
`invitations` que distingue invitar-subcuenta de invitar-instalador, la RPC de configuración de
empresa y `auth_can_see_commercials`.

## SUBCTA-DEC-04 — `auth_can_see_commercials` (bloque 8) se extiende, no se reabre

```sql
create or replace function auth_can_see_commercials(p_company_id uuid) returns boolean as $$
  select auth_is_company_owner(p_company_id)
     or exists (
       select 1 from company_staff_permissions csp
       where csp.user_id = auth.uid()
         and csp.company_id = p_company_id
         and csp.can_manage_finance
     )
$$;
```

Es exactamente el punto de extensión que el bloque 8 dejó escrito. El coordinador sigue sin
alcanzar esta función (no es `company_manager`): la decisión de esa spec no se toca.

## SUBCTA-DEC-05 — Configuración de empresa: mismo patrón

`set_company_min_completion_photos` cambia su guarda de `auth_role() = 'company_manager'` a
`auth_is_company_owner(v_company) or (existe permiso can_manage_settings)`. Es la única mutación de
«ajustes de empresa» que existe hoy en el código; si aparece otra, sigue el mismo criterio.

## SUBCTA-DEC-06 — Alta de subcuenta: se generaliza `invite-signup.ts`, no se agrega un tercer sitio

`invitations.role` (ya existe, hoy `installer`/`coordinator`) suma el valor `company_staff`, más dos
columnas usadas sólo en ese caso: `staff_can_manage_finance`, `staff_can_manage_settings` (el dueño
las fija al invitar; SUBCTA-R3.3).

**Autorización para crear la invitación:** se tensa la política única `invitations_manager_all`
(hoy `for all` sin distinguir) para que una fila `role = 'company_staff'` sólo la pueda
insertar/editar/borrar/leer quien pase `auth_is_company_owner`; las filas `installer`/`coordinator`
siguen abiertas a cualquier `company_manager` (es «equipo», que es operativo). Se agrega la misma
condición a `invitations_coordinator_read` para que un coordinador no vea que se está invitando
personal administrativo.

**Aceptación — nueva RPC, no se toca `accept_invitation`:** esa función exige
`auth_role() in ('installer', 'coordinator')` y hace inserts de instalador que no aplican acá.
Se agrega `accept_company_staff_invitation(p_token uuid)`, `security definer`, que: bloquea la fila
de la invitación, verifica `pending`, sin vencer, `role = 'company_staff'`, el email igual al de la
sesión; crea la fila de `company_staff_permissions` con los booleanos de la invitación; marca la
invitación aceptada. **No crea el perfil** — eso ya lo hizo `handle_new_user` al crear la cuenta,
un paso antes.

**El alta de la cuenta pasa por `lib/actions/invite-signup.ts`, el único lugar además de
`app/api/master/**` con permiso de usar `service_role`.** Se agrega `signUpCompanyStaff`, hermana
de `signUpInstaller`: valida la invitación con `invitation_preview` (ya genérica: sólo agrega el
valor nuevo de `role`), crea el usuario con
`admin.auth.admin.createUser({ app_metadata: { role: "company_manager", company_id, is_owner:
false, full_name, locale } })` —nunca `user_metadata`, que el cliente no controla nada crítico—,
inicia sesión, llama a la RPC nueva, y compensa (borra la cuenta) si cualquier paso falla, igual que
`signUpInstaller`.

`handle_new_user` gana una lectura más de `raw_app_meta_data`: `is_owner` (default `true` si no
viene, que es lo correcto para el alta de empresa del tablero maestro, que nunca la manda).

## SUBCTA-DEC-07 — Página de invitación: una rama más, mismo esqueleto

`app/invite/[token]/page.tsx` ya rama por `invite.valid` y por si hay sesión. Se agrega una rama por
`invite.invite_role === 'company_staff'`: sin sesión, `StaffSignupForm` (calco de
`InstallerSignupForm` apuntando a `signUpCompanyStaff`); con sesión, un aviso a cerrarla primero (una
subcuenta es una cuenta nueva, no una membresía que se suma a la que ya está abierta — mismo criterio
que ya usa la rama de instalador para un gerente logueado).

## SUBCTA-DEC-08 — Interfaz: sección nueva en «Equipo», visible sólo al dueño

Se agrega a `/team` una sección «Personal administrativo» (lista de subcuentas de la empresa con sus
dos permisos en toggles + invitar nueva), visible sólo cuando `user.isOwner`. Las invitaciones de
subcuenta se listan aparte de `PendingInvitations` (que sigue mostrando sólo instalador/coordinador);
`fetchPendingInvitations` suma un filtro explícito por esos dos roles para que una subcuenta jamás
aparezca ahí aunque cambiara la RLS.

`/finance` deja de redirigir sólo por `role !== 'company_manager'`: redirige también si es una
subcuenta sin `canManageFinance`. En `/settings`, el formulario de configuración de empresa se oculta
si es una subcuenta sin `canManageSettings` (el resto de la página —contraseña, 2FA— sigue igual
para cualquiera).

## Riesgos

- **Blast radius controlado, pero no cero:** cualquier lugar del código que compare
  `role === "company_manager"` para decidir algo GANA automáticamente a las subcuentas. Se revisó la
  lista completa (auditoría del README) y las tres excepciones reales son finanzas, configuración de
  empresa y gestión de subcuentas; no se encontró una cuarta. Si aparece una después, el criterio es
  el mismo: `isOwner || permiso específico`.
- **Migrar `invitations` con datos reales:** sólo se agregan columnas con default y se amplía un
  `check`; no hay riesgo de pérdida de datos.
- **Un dueño que se saca a sí mismo `is_owner`:** no hay UI para que el dueño edite su propia fila de
  `profiles.is_owner`, y las políticas de `company_staff_permissions` sólo aceptan filas para
  perfiles con `is_owner = false`: un dueño no puede convertirse en subcuenta por accidente.
