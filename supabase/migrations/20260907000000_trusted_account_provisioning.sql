-- Application roles must come from admin-controlled metadata, never signUp data.
-- Existing profiles remain unchanged. Master invitations provision the profile
-- explicitly with the already-authorized service client before sending email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_role text := new.raw_app_meta_data ->> 'role';
  v_role text := 'installer';
  v_company uuid;
begin
  if v_requested_role in ('platform_admin', 'company_manager') then
    v_role := v_requested_role;
  end if;
  if v_role = 'company_manager' then
    v_company := nullif(new.raw_app_meta_data ->> 'company_id', '')::uuid;
    if v_company is null then
      raise exception 'manager_company_required' using errcode = '23514';
    end if;
  end if;

  insert into public.profiles (id, role, company_id, full_name, locale)
  values (
    new.id, v_role, v_company,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_app_meta_data ->> 'full_name', ''),
    case when coalesce(new.raw_user_meta_data ->> 'locale', new.raw_app_meta_data ->> 'locale') = 'pt' then 'pt' else 'es' end
  );
  if v_role = 'installer' then
    insert into public.installers (id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
