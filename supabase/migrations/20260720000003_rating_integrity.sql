-- La calificación siempre pertenece al instalador asignado a la orden.
-- Evita que un cliente autenticado manipule installer_id saltándose la UI.
drop policy if exists ratings_company_insert on public.ratings;

create policy ratings_company_insert on public.ratings
  for insert with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = public.auth_company()
        and w.status = 'finalizada'
        and w.assigned_installer_id = installer_id
    )
  );
