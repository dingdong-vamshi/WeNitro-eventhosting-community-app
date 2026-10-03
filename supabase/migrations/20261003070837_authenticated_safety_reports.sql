-- The client already submits directly to these tables, but only the Admin
-- policy existed. Permit authenticated, attributable reports without exposing
-- other reporters or allowing self/host reporting and private-activity probing.
alter table public.tbl_event_reports enable row level security;
alter table public.tbl_user_reports enable row level security;
create policy member_report_read on public.tbl_event_reports for select to authenticated
 using(reporter_id=(select public.current_app_user_id()));
create policy member_report_insert on public.tbl_event_reports for insert to authenticated
 with check(reporter_id=(select public.current_app_user_id()) and status='open'
 and length(btrim(reason)) between 3 and 300 and length(coalesce(description,''))<=2000
 and exists(select 1 from public.tbl_events e where e.id=event_id and e.created_by<>reporter_id and not coalesce(e.is_deleted,false)));
create policy member_report_read on public.tbl_user_reports for select to authenticated
 using(reporter_id=(select public.current_app_user_id()));
create policy member_report_insert on public.tbl_user_reports for insert to authenticated
 with check(reporter_id=(select public.current_app_user_id()) and target_user_id<>reporter_id and status='open'
 and length(btrim(reason)) between 3 and 300 and length(coalesce(description,''))<=2000
 and exists(select 1 from public.tbl_users u where u.id=target_user_id and coalesce(u.is_delete,0)=0));
grant select,insert on public.tbl_event_reports,public.tbl_user_reports to authenticated;
