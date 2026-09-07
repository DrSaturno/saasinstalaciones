begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.companies (id, name, country, order_prefix)
values ('b7000000-0000-0000-0000-000000000001', 'Provisioning test', 'AR', 'TPR');

-- Payloads from a direct signUp request: every field below is user controlled.
insert into auth.users (id, raw_user_meta_data) values
('b7000000-0000-0000-0000-000000000011', '{"role":"platform_admin","full_name":"Test"}'),
('b7000000-0000-0000-0000-000000000012', '{"role":"company_manager","company_id":"b7000000-0000-0000-0000-000000000001"}'),
('b7000000-0000-0000-0000-000000000013', '{"role":"company_manager","company_id":"invalid","locale":"invalid"}');

select is((select role from public.profiles where id = 'b7000000-0000-0000-0000-000000000011'), 'installer', 'signup cannot become platform admin');
select is((select role from public.profiles where id = 'b7000000-0000-0000-0000-000000000012'), 'installer', 'signup cannot become manager');
select is((select company_id from public.profiles where id = 'b7000000-0000-0000-0000-000000000012'), null::uuid, 'signup cannot choose a tenant');
select is((select locale from public.profiles where id = 'b7000000-0000-0000-0000-000000000013'), 'es', 'untrusted metadata is normalized');

insert into auth.users (id, raw_app_meta_data) values
('b7000000-0000-0000-0000-000000000014', '{"role":"company_manager","company_id":"b7000000-0000-0000-0000-000000000001"}');
select is((select role from public.profiles where id = 'b7000000-0000-0000-0000-000000000014'), 'company_manager', 'admin provisioning still works');

set local role authenticated;
set local request.jwt.claims = '{"sub":"b7000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok($$update public.profiles set role = 'platform_admin' where id = auth.uid()$$, 'P0001', null, 'installer cannot elevate the profile after signup');
select * from finish();
rollback;
