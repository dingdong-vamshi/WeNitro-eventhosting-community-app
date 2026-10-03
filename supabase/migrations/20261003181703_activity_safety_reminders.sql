-- Source: Must changesimplementations.pdf, page 37. The requested SOS reminder
-- is an in-app notification, ten minutes before an Activity starts. This does
-- not implement push transport, background tracking, or emergency dispatch.
create table private.activity_safety_reminder_deliveries (
 event_id integer not null references public.tbl_events(id) on delete cascade,
 user_id integer not null references public.tbl_users(id) on delete cascade,
 starts_at timestamptz not null,
 delivered_at timestamptz not null default now(),
 primary key(event_id,user_id,starts_at)
);
alter table private.activity_safety_reminder_deliveries enable row level security;
revoke all on private.activity_safety_reminder_deliveries from public,anon,authenticated;
create index activity_safety_reminder_due on public.tbl_events(event_start_time,id)
 where status='published' and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false);

create function private.dispatch_due_activity_safety_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare due record; delivered integer:=0; inserted integer;
begin
 -- Lock the Activity while checking eligibility, and skip rows being changed
 -- by another transaction. The unique ledger also makes concurrent retries safe.
 -- The bounded batch resumes at the next minute, excluding already sent rows.
 for due in
  select e.id as event_id,e.event_start_time,recipient.user_id
  from public.tbl_events e
  cross join lateral (
   select e.created_by as user_id
   union
   select p.user_id from public.tbl_event_participants p
    where p.event_id=e.id and p.status in ('approved','going','paid')
  ) recipient
  join public.tbl_users u on u.id=recipient.user_id
  join auth.users a on a.id=u.auth_user_id
  where e.status='published' and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false)
   and e.event_start_time>now() and e.event_start_time<=now()+interval '10 minutes'
   and (e.event_end_time is null or e.event_end_time>now())
   and coalesce(u.is_active,0)=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null
   and (a.banned_until is null or a.banned_until<=now())
   and not exists(select 1 from private.activity_safety_reminder_deliveries d
    where d.event_id=e.id and d.user_id=recipient.user_id and d.starts_at=e.event_start_time)
  order by e.event_start_time,e.id,recipient.user_id
  limit 1000 for update of e skip locked
 loop
  insert into private.activity_safety_reminder_deliveries(event_id,user_id,starts_at)
   values(due.event_id,due.user_id,due.event_start_time) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 then
   perform private.enqueue_notification(due.user_id,'activity_safety_reminder','Activity safety reminder',
    'Make sure to share your activity details and live location with someone you trust.',
    due.event_id::text,null,jsonb_build_object('event_id',due.event_id,'starts_at',due.event_start_time,'action','activity_safety'));
   delivered:=delivered+1;
  end if;
 end loop;
 return delivered;
end $$;
revoke all on function private.dispatch_due_activity_safety_reminders() from public,anon,authenticated;

-- Existing pg_cron installation: first minute tick at/after start-minus-ten.
-- A changed start time gets a new reminder; stale/cancelled/deleted/left users
-- are never queued merely because they were eligible at an earlier time.
select cron.schedule('wenitro-activity-safety-reminders','* * * * *','select private.dispatch_due_activity_safety_reminders()');
