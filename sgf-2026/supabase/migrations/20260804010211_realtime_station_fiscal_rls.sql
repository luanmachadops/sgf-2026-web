-- Políticas SELECT mínimas necessárias para o Realtime respeitar o mesmo
-- escopo já aplicado pelas RPCs dos portais de posto e oficina.

drop policy if exists station_catalog_items_realtime_select
  on public.station_catalog_items;
create policy station_catalog_items_realtime_select
  on public.station_catalog_items
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.get_user_tenant_id())
      and (
        (select public.is_admin_or_manager())
        or (
          (select public.is_posto())
          and station_id = (select public.get_user_station_id())
        )
      )
    )
  );

drop policy if exists station_operations_realtime_select
  on public.station_operations;
create policy station_operations_realtime_select
  on public.station_operations
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.get_user_tenant_id())
      and (
        (select public.is_admin_or_manager())
        or (
          (select public.is_posto())
          and station_id = (select public.get_user_station_id())
        )
      )
    )
  );

drop policy if exists station_monthly_closings_realtime_select
  on public.station_monthly_closings;
create policy station_monthly_closings_realtime_select
  on public.station_monthly_closings
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.get_user_tenant_id())
      and (
        (select public.is_admin_or_manager())
        or (
          (select public.is_posto())
          and station_id = (select public.get_user_station_id())
        )
      )
    )
  );

drop policy if exists station_closing_invoices_realtime_select
  on public.station_closing_invoices;
create policy station_closing_invoices_realtime_select
  on public.station_closing_invoices
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.get_user_tenant_id())
      and (
        (select public.is_admin_or_manager())
        or (
          (select public.is_posto())
          and station_id = (select public.get_user_station_id())
        )
      )
    )
  );

drop policy if exists station_closing_payments_realtime_select
  on public.station_closing_payments;
create policy station_closing_payments_realtime_select
  on public.station_closing_payments
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.get_user_tenant_id())
      and (
        (select public.is_admin_or_manager())
        or (
          (select public.is_posto())
          and exists (
            select 1
              from public.station_monthly_closings c
             where c.id = station_closing_payments.closing_id
               and c.station_id = (select public.get_user_station_id())
          )
        )
      )
    )
  );

drop policy if exists station_monthly_closing_events_realtime_select
  on public.station_monthly_closing_events;
create policy station_monthly_closing_events_realtime_select
  on public.station_monthly_closing_events
  for select to authenticated
  using (
    (select public.is_superadmin())
    or (
      tenant_id = (select public.get_user_tenant_id())
      and (
        (select public.is_admin_or_manager())
        or (
          (select public.is_posto())
          and exists (
            select 1
              from public.station_monthly_closings c
             where c.id = station_monthly_closing_events.closing_id
               and c.station_id = (select public.get_user_station_id())
          )
        )
      )
    )
  );

drop policy if exists service_order_payments_oficina_realtime_select
  on public.service_order_payments;
create policy service_order_payments_oficina_realtime_select
  on public.service_order_payments
  for select to authenticated
  using (
    (select public.is_oficina())
    and tenant_id = (select public.get_user_tenant_id())
    and exists (
      select 1
        from public.service_orders so
       where so.id = service_order_payments.service_order_id
         and so.repair_shop_id = (select public.get_user_repair_shop_id())
    )
  );
