# Diseño — bloque 7 (link público de seguimiento)

## Esquema

```sql
create table public.project_tracking_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint project_tracking_links_project_company_fk
    foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade
);

-- Un solo link activo por proyecto: generar uno nuevo revoca el anterior en
-- la misma función, nunca coexisten dos.
create unique index project_tracking_links_one_active_idx
  on public.project_tracking_links (project_id)
  where revoked_at is null;
```

RLS de la tabla (para la empresa, no para el cliente): `select`/`insert` vía
`can_operate_project(project_id)`, mismo criterio que ya decide quién le
puede escribir al cliente
(`supabase/migrations/20260724000002_coordinator_clients_messaging.sql`).
Revocar es un `update` de `revoked_at`, mismo permiso.

## La función pública

```sql
create or replace function public.project_tracking_snapshot(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_link record;
  v_project record;
  v_milestones jsonb;
  v_photos jsonb;
  v_done integer;
  v_total integer;
begin
  select ptl.*, c.status as company_status
  into v_link
  from public.project_tracking_links ptl
  join public.companies c on c.id = ptl.company_id
  where ptl.token = p_token;

  if not found or v_link.revoked_at is not null or v_link.company_status <> 'active' then
    return jsonb_build_object('valid', false);
  end if;

  select p.name, p.client_name, p.status into v_project
  from public.projects p where p.id = v_link.project_id;

  select
    count(*) filter (where w.status = 'finalizada'),
    count(*)
  into v_done, v_total
  from public.work_orders w
  where w.project_id = v_link.project_id and w.status <> 'cancelada';

  select coalesce(jsonb_agg(jsonb_build_object(
    'site', s.name,
    'title', w.title,
    'status', w.status,
    'date', coalesce(w.finalized_at::date, w.scheduled_date)
  ) order by coalesce(w.finalized_at, w.scheduled_date::timestamptz) nulls last), '[]'::jsonb)
  into v_milestones
  from public.work_orders w
  join public.sites s on s.id = w.site_id
  where w.project_id = v_link.project_id and w.status <> 'cancelada';

  select coalesce(jsonb_agg(distinct photo), '[]'::jsonb)
  into v_photos
  from public.work_orders w
  join public.order_updates u on u.order_id = w.id
  cross join lateral jsonb_array_elements_text(u.photos) as photo
  where w.project_id = v_link.project_id and w.status = 'finalizada'
  limit 30;

  return jsonb_build_object(
    'valid', true,
    'projectName', v_project.name,
    'clientName', v_project.client_name,
    'status', v_project.status,
    'completionPct', case when v_total > 0 then round(v_done * 100.0 / v_total) else 0 end,
    'milestones', v_milestones,
    'photoPaths', v_photos
  );
end;
$fn$;

revoke all on function public.project_tracking_snapshot(uuid) from public, anon;
grant execute on function public.project_tracking_snapshot(uuid) to anon, authenticated;
```

(el `revoke ... grant` de dos pasos es intencional: primero se revoca todo —
incluido lo que el default de Postgres le da a `anon` en este proyecto, la
trampa que encontró el bloque 5 — y recién después se concede explícito.)

`photoPaths` son RUTAS del bucket `evidence`, no URLs: la página las firma
server-side con el cliente anon (ver abajo), nunca la función SQL.

## Firmar las fotos: la política de storage nueva

Las rutas de `evidence` siguen la convención `{company_id}/{order_id}/archivo`
(`storage.foldername(name)`). Nueva policy, acotada:

```sql
create policy evidence_public_tracking_read on storage.objects
  for select to anon
  using (
    bucket_id = 'evidence'
    and exists (
      select 1
      from public.work_orders w
      join public.project_tracking_links ptl on ptl.project_id = w.project_id
      join public.companies c on c.id = ptl.company_id
      where w.id = ((storage.foldername(name))[2])::uuid
        and w.status = 'finalizada'
        and ptl.revoked_at is null
        and c.status = 'active'
    )
  );
```

No filtra por un token específico (RLS no puede leer un valor de la request
que no sea `auth.*`) — filtra por "el proyecto de esta orden tiene un link
activo", que por `project_tracking_links_one_active_idx` es siempre CERO O
UNO. Revocar el único link activo de un proyecto dejar de cumplir esta
policy para todas sus fotos, así que en la práctica equivale a filtrar por
token. La página igual valida el token específico antes de intentar nada
(la función de arriba): un token revocado nunca llega a pedir fotos.

`anon` necesita además el `grant` de base sobre `storage.objects` que hoy
puede faltarle (mismo tipo de sorpresa que la del bloque 5 con `EXECUTE`) —
se verifica contra Demo antes de dar la tarea por cerrada, no se asume.

## La página

`app/seguimiento/[token]/page.tsx` — fuera de toda área con rol, mismo nivel
que `app/invite/[token]/page.tsx`. `proxy.ts` gana
`path.startsWith("/seguimiento/")` en `isPublic`.

```
1. enforceRateLimit("project_tracking", await clientIp(), 30, 300)
2. supabase.rpc("project_tracking_snapshot", { p_token: token })  // createClient() normal, sin sesión = anon
3. si valid=false → pantalla "link no disponible"
4. si hay fotos: supabase.storage.from("evidence").createSignedUrls(photoPaths, 60 * 30)
5. render: nombre, cliente, estado, % avance (reusa el mismo componente
   OrderCompletionPie del bloque 6, con done/total), hitos, fotos
```

## Generar/revocar el link (lado empresa)

`lib/actions/project-tracking-links.ts`:
`createProjectTrackingLink(projectId)` (revoca el activo si existe e
inserta uno nuevo, misma transacción vía una función `security definer`
`rotate_project_tracking_link` para que las dos escrituras no puedan quedar
a mitad) y `revokeProjectTrackingLink(projectId)`.

UI: un botón en la ficha del proyecto ("Link para el cliente"), gateado por
el mismo `can_operate_project` — en la práctica, gerente o coordinador del
proyecto, sin relación con `canManageFinance` (esto no es dato comercial).
