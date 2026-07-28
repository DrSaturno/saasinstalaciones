-- Foto de perfil para instaladores y coordinadores.
--
-- El bucket es PÚBLICO a propósito, a diferencia de `evidence`: una foto de
-- perfil se muestra en listados, chat y fichas, y firmar cada URL en cada
-- pantalla sería caro y frágil. No hay dato sensible en un avatar. El control
-- está en la escritura: cada persona sólo puede tocar su propia carpeta.
--
-- Idempotente: se puede re-ejecutar sin daño.

alter table public.profiles
  add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  'Ruta dentro del bucket público `avatars`. NULL = sin foto, se muestran las iniciales.';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Lectura libre: el bucket es público.
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

-- Escritura sólo en la carpeta propia: avatars/<uid>/...
drop policy if exists avatars_own_insert on storage.objects;
create policy avatars_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
