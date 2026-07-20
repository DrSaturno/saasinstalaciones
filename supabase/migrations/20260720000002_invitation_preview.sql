-- =============================================================
-- Preview de invitación por token (Paso 7 — roster)
--
-- El instalador que abre un link /invite/<token> necesita ver de qué empresa
-- es la invitación ANTES de aceptarla. Pero la RLS de `invitations` solo deja
-- leerla al manager de esa empresa. Esta función security-definer expone lo
-- mínimo (nombre de empresa, email, validez) a quien tenga el token —
-- que es un uuid imposible de adivinar.
-- =============================================================

create or replace function public.invitation_preview(p_token uuid)
returns table (company_name text, email text, valid boolean)
language sql
security definer
set search_path = public
as $$
  select
    c.name,
    i.email,
    (i.status = 'pending' and i.expires_at > now()) as valid
  from public.invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_token;
$$;

grant execute on function public.invitation_preview(uuid) to anon, authenticated;
