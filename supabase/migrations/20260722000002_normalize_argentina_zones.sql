-- Normaliza zonas históricas argentinas al catálogo funcional nuevo.
-- Los datos demo anteriores usaban códigos como AR-BA-AMBA y AR-CBA.

update public.sites s
set zone = case
  when upper(s.zone) like '%AMBA%' then 'AMBA'
  else 'Interior'
end
from public.projects p
where p.id = s.project_id
  and p.country = 'AR';

update public.projects p
set zones = normalized.zones
from (
  select s.project_id,
    array_agg(distinct s.zone order by s.zone)::text[] as zones
  from public.sites s
  join public.projects source_project on source_project.id = s.project_id
  where source_project.country = 'AR'
  group by s.project_id
) normalized
where p.id = normalized.project_id;

-- Reinicia sólo las secuencias argentinas y vuelve a numerar los datos demo.
-- Se usa un valor temporal único para no colisionar durante el recálculo.
delete from public.order_sequences sequence
using public.companies company
where company.id = sequence.company_id
  and company.country = 'AR';

update public.work_orders work_order
set order_number = 'TMP-' || work_order.id::text
from public.companies company
where company.id = work_order.company_id
  and company.country = 'AR';

do $$
declare
  row_to_number record;
begin
  for row_to_number in
    select work_order.id, work_order.company_id, work_order.site_id
    from public.work_orders work_order
    join public.companies company on company.id = work_order.company_id
    where company.country = 'AR'
    order by work_order.created_at, work_order.id
  loop
    update public.work_orders
    set order_number = public.next_regional_order_number(
      row_to_number.company_id,
      row_to_number.site_id
    )
    where id = row_to_number.id;
  end loop;
end;
$$;
