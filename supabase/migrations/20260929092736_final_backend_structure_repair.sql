-- Reconcile the live WeNitro schema with the migrations that already define
-- Vibe reporting, activity-Vibe eligibility, and host activity validation.
-- This migration contains no production data restoration or seed content.

-- The live tbl_vibe_reports table predates the guarded report_vibe RPC.
-- Preserve any rows if this migration is ever reused outside the audited
-- project, while normalizing the legacy column names in place.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tbl_vibe_reports'
      and column_name='reporter_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tbl_vibe_reports'
      and column_name='reported_by'
  ) then
    alter table public.tbl_vibe_reports rename column reporter_id to reported_by;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tbl_vibe_reports'
      and column_name='description'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tbl_vibe_reports'
      and column_name='details'
  ) then
    alter table public.tbl_vibe_reports rename column description to details;
  end if;
end $$;

alter table public.tbl_vibe_reports
  add column if not exists details text,
  add column if not exists status text,
  add column if not exists updated_at timestamptz;

update public.tbl_vibe_reports
set details=coalesce(details,''),
    status=coalesce(status,'open'),
    updated_at=coalesce(updated_at,created_at,now());

-- Normalize the identifier types to the contract introduced by the guarded
-- reporting migration. Recreate the FK afterward so its definition is clear.
alter table public.tbl_vibe_reports
  drop constraint if exists tbl_vibe_reports_vibe_id_fkey;
alter sequence if exists public.tbl_vibe_reports_id_seq as bigint;
alter table public.tbl_vibe_reports
  alter column id type bigint using id::bigint,
  alter column vibe_id type bigint using vibe_id::bigint,
  alter column reason type text using reason::text,
  alter column details set default '',
  alter column details set not null,
  alter column status set default 'open',
  alter column status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.tbl_vibe_reports'::regclass
      and conname='tbl_vibe_reports_reporter_id_fkey'
  ) and not exists (
    select 1 from pg_constraint
    where conrelid='public.tbl_vibe_reports'::regclass
      and conname='tbl_vibe_reports_reported_by_fkey'
  ) then
    alter table public.tbl_vibe_reports
      rename constraint tbl_vibe_reports_reporter_id_fkey
      to tbl_vibe_reports_reported_by_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.tbl_vibe_reports'::regclass
      and conname='tbl_vibe_reports_vibe_id_fkey'
  ) then
    alter table public.tbl_vibe_reports
      add constraint tbl_vibe_reports_vibe_id_fkey
      foreign key(vibe_id) references public.tbl_activity_vibes(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.tbl_vibe_reports'::regclass
      and conname='tbl_vibe_reports_reported_by_fkey'
  ) then
    alter table public.tbl_vibe_reports
      add constraint tbl_vibe_reports_reported_by_fkey
      foreign key(reported_by) references public.tbl_users(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.tbl_vibe_reports'::regclass
      and conname='tbl_vibe_reports_vibe_id_reported_by_key'
  ) then
    alter table public.tbl_vibe_reports
      add constraint tbl_vibe_reports_vibe_id_reported_by_key
      unique(vibe_id,reported_by);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.tbl_vibe_reports'::regclass
      and conname='tbl_vibe_reports_status_check'
  ) then
    alter table public.tbl_vibe_reports
      add constraint tbl_vibe_reports_status_check
      check(status in ('open','reviewing','resolved','dismissed'));
  end if;
end $$;

create index if not exists idx_vibe_reports_reported_by
  on public.tbl_vibe_reports(reported_by);

alter table public.tbl_vibe_reports enable row level security;
revoke all on table public.tbl_vibe_reports from public,anon,authenticated;
grant all on table public.tbl_vibe_reports to service_role;

drop policy if exists vibe_reports_deny_direct on public.tbl_vibe_reports;
create policy vibe_reports_deny_direct on public.tbl_vibe_reports
for all to authenticated using(false) with check(false);

create or replace function public.report_vibe(
  p_vibe_id bigint,p_reason text,p_details text default ''
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  me integer:=public.get_current_app_user_id();
  vibe public.tbl_activity_vibes;
  report_id bigint;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into vibe
  from public.tbl_activity_vibes v
  where v.id=p_vibe_id
    and (
      v.visibility='public'
      or (v.visibility='activity' and public.is_event_participant(v.event_id::integer))
    );
  if vibe.id is null then raise exception 'Vibe is unavailable'; end if;
  if vibe.user_id=me then raise exception 'You cannot report your own Vibe'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 100
     or length(btrim(coalesce(p_details,'')))>1000 then
    raise exception 'Choose a valid reason and keep details under 1000 characters'
      using errcode='22023';
  end if;
  insert into public.tbl_vibe_reports(vibe_id,reported_by,reason,details,updated_at)
  values(p_vibe_id,me,btrim(p_reason),btrim(coalesce(p_details,'')),now())
  on conflict(vibe_id,reported_by) do update
  set reason=excluded.reason,details=excluded.details,status='open',updated_at=now()
  returning id into report_id;
  return jsonb_build_object('id',report_id,'submitted',true);
end
$$;
revoke all on function public.report_vibe(bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.report_vibe(bigint,text,text) to authenticated;

create or replace function private.enforce_vibe_activity_eligibility()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='UPDATE'
     and new.event_id is not distinct from old.event_id
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;
  if auth.uid() is null and auth.role()='service_role' then return new; end if;
  if new.event_id is not null
     and not private.viewer_can_post_activity_vibe(new.event_id::integer) then
    raise exception 'Join or host this activity before posting a Vibe.'
      using errcode='42501';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_vibe_activity_eligibility()
  from public,anon,authenticated;

drop trigger if exists enforce_vibe_activity_eligibility
  on public.tbl_activity_vibes;
create trigger enforce_vibe_activity_eligibility
before insert or update of event_id,user_id on public.tbl_activity_vibes
for each row execute function private.enforce_vibe_activity_eligibility();

drop trigger if exists validate_host_activity_fields on public.tbl_events;
create trigger validate_host_activity_fields
before insert or update of
  max_participants,age_min,age_max,gender_preference,
  event_start_time,event_end_time,registration_close_time,
  latitude,longitude,is_paid,price
on public.tbl_events
for each row execute function private.validate_host_activity_fields();

notify pgrst,'reload schema';
