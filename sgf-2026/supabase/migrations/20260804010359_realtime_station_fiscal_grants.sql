-- O Realtime faz a autorização com o papel do assinante. As policies RLS da
-- migration anterior limitam linhas por tenant/parceiro; estes grants liberam
-- somente a operação SELECT necessária para essa autorização.
grant select on table
  public.station_catalog_items,
  public.station_operations,
  public.station_monthly_closings,
  public.station_closing_invoices,
  public.station_closing_payments,
  public.station_monthly_closing_events
to authenticated;
