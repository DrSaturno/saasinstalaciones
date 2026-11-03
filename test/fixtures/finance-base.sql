-- Minimal pre-finance schema contract, synthetic and in-memory only.
create role anon;
create role authenticated;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create table companies(id uuid primary key,name text default 'Synthetic company',country text default 'AR',status text default 'active',min_completion_photos smallint default 3);
create table profiles(id uuid primary key,company_id uuid references companies(id),role text not null,full_name text default 'Synthetic person',locale text default 'es');
alter table profiles enable row level security;
create policy own_read on profiles for select to authenticated using(id=auth.uid());
create policy own_update on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create function auth_role() returns text language sql stable security definer as $$select role from public.profiles where id=auth.uid()$$;
create function auth_company() returns uuid language sql stable security definer as $$select company_id from public.profiles where id=auth.uid()$$;
create function auth_is_company_manager(uuid) returns boolean language sql stable security definer as $$select auth_role()='company_manager' and auth_company()=$1$$;
create function auth_companies(text) returns setof uuid language sql stable security definer as $$select company_id from public.profiles where id=auth.uid()$$;
create table installers(id uuid primary key);
create table company_installers(company_id uuid references companies(id),installer_id uuid references profiles(id),status text default 'active',primary key(company_id,installer_id));
create table clients(id uuid primary key,company_id uuid references companies(id),name text default 'Synthetic client',unique(id,company_id));
create table projects(id uuid primary key,company_id uuid references companies(id),client_id uuid,name text default 'Synthetic project',billing_mode text default 'per_installation',contract_amount numeric(14,2),currency text default 'ARS');
create table sites(id uuid primary key,company_id uuid references companies(id),name text default 'Synthetic site',zone text default 'AMBA');
create table work_orders(id uuid primary key,company_id uuid references companies(id),project_id uuid references projects(id),site_id uuid references sites(id),order_number text,title text default 'Synthetic OT',amount numeric(14,2),installer_amount numeric(14,2),assigned_installer_id uuid,currency text default 'ARS',status text default 'planificada',finalized_at timestamptz,payment_status text default 'pending',payment_status_changed_at timestamptz,payment_status_changed_by uuid,unique(id,company_id));
create table order_payment_events(id uuid primary key default gen_random_uuid(),order_id uuid,company_id uuid,status text,note text,changed_by uuid,created_at timestamptz default now());
create table invitations(id uuid primary key default gen_random_uuid(),company_id uuid references companies(id),email text,token uuid default gen_random_uuid(),role text check(role in('installer','coordinator')),status text default 'pending',expires_at timestamptz default now()+interval '1 week');
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create function storage.filename(text) returns text language sql as $$select (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)]$$;
grant usage on schema public,auth,storage to authenticated,anon;
grant select on companies,clients,projects,sites,work_orders,company_installers to authenticated;
grant select,update on profiles to authenticated;
grant execute on all functions in schema auth to authenticated,anon;
