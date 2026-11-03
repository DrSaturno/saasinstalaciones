-- Contract of the existing private-pricing and helper-installer branch.
alter table projects add constraint projects_id_company_key unique(id,company_id);
create table work_order_pricing(order_id uuid primary key,company_id uuid,amount numeric(14,2));
create table project_pricing(project_id uuid primary key,company_id uuid,contract_amount numeric(14,2));
create table work_order_team_members(id uuid primary key,company_id uuid,order_id uuid,installer_id uuid,installer_amount numeric(14,2),status text default 'active',payment_status text default 'pending',payment_status_changed_at timestamptz,payment_status_changed_by uuid);
alter table work_order_pricing enable row level security;
alter table project_pricing enable row level security;
alter table work_order_team_members enable row level security;
grant select,insert,update,delete on work_order_pricing,project_pricing,work_order_team_members to authenticated;
create policy prices_company on work_order_pricing for all to authenticated using(auth_can_see_commercials(company_id)) with check(auth_can_see_commercials(company_id));
create policy project_prices_company on project_pricing for all to authenticated using(auth_can_see_commercials(company_id)) with check(auth_can_see_commercials(company_id));
create policy helper_company on work_order_team_members for all to authenticated using(auth_is_company_manager(company_id)) with check(auth_is_company_manager(company_id));
