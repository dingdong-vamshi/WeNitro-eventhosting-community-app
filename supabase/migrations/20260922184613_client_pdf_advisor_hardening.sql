-- Direct table access stays denied; authenticated clients use the guarded RPCs.
drop policy if exists activity_invites_deny_direct on public.tbl_activity_invites;
create policy activity_invites_deny_direct on public.tbl_activity_invites
for all to authenticated using (false) with check (false);

drop policy if exists vibe_reports_deny_direct on public.tbl_vibe_reports;
create policy vibe_reports_deny_direct on public.tbl_vibe_reports
for all to authenticated using (false) with check (false);

create index if not exists idx_activity_invites_event on public.tbl_activity_invites(event_id);
create index if not exists idx_activity_invites_created_by on public.tbl_activity_invites(created_by);
create index if not exists idx_vibe_reports_reported_by on public.tbl_vibe_reports(reported_by);
