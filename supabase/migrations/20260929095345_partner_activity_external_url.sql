alter table public.tbl_events
  add column if not exists external_url text;

alter table public.tbl_events
  drop constraint if exists tbl_events_external_url_valid;
alter table public.tbl_events
  add constraint tbl_events_external_url_valid check (
    external_url is null
    or (length(external_url) between 12 and 2048 and external_url ~ '^https://[^[:space:]]+$')
  );

create or replace function public.set_partner_activity_external_url(
  p_event_id integer,
  p_external_url text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  clean_url text := nullif(trim(coalesce(p_external_url, '')), '');
begin
  if not private.can_manage_activity(p_event_id, me) then
    raise exception 'Activity not found or not manageable' using errcode = '42501';
  end if;
  if not private.has_active_partner(me) then
    raise exception 'Only approved Partners can add an external activity URL' using errcode = '42501';
  end if;
  if clean_url is not null and (
    length(clean_url) > 2048 or clean_url !~ '^https://[^[:space:]]+$'
  ) then
    raise exception 'Enter a valid HTTPS URL';
  end if;
  update public.tbl_events
  set external_url = clean_url, updated_by = me, updated_at = now()
  where id = p_event_id;
  return clean_url;
end;
$$;

revoke all on function public.set_partner_activity_external_url(integer,text)
  from public, anon;
grant execute on function public.set_partner_activity_external_url(integer,text)
  to authenticated;

comment on column public.tbl_events.external_url is
  'Optional approved-Partner HTTPS information/registration URL. Cashfree amounts remain server-authoritative.';
