-- Activity prices are onsite information only. Existing payment records and
-- Cashfree functions remain intact for historical reconciliation, but price no
-- longer controls hosting eligibility or participation state.
drop trigger if exists enforce_partner_paid_hosting on public.tbl_events;

create or replace function public.request_join_activity(
  p_event_id integer,
  p_status text default 'going'
)
returns public.tbl_event_participants
language plpgsql
security definer
set search_path = public
as $function$
declare
  me integer := public.get_current_app_user_id();
  event_row public.tbl_events;
  db_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  select * into event_row
  from public.tbl_events
  where id = p_event_id
    and not coalesce(is_deleted, false)
    and not coalesce(is_cancelled, false)
  for update;

  if event_row.id is null then
    raise exception 'Activity is unavailable';
  end if;
  if p_status not in ('left', 'declined') then
    perform private.assert_registration_complete(p_event_id, me);
  end if;
  if event_row.created_by = me then
    raise exception 'Hosts cannot join their own activity';
  end if;
  if event_row.registration_close_time is not null
     and event_row.registration_close_time < now()
     and p_status not in ('left', 'declined') then
    raise exception 'Registration is closed';
  end if;
  if p_status not in ('going', 'interested', 'waitlist', 'left', 'declined') then
    raise exception 'Invalid participation status';
  end if;

  select count(*) into occupied
  from public.tbl_event_participants
  where event_id = p_event_id
    and user_id <> me
    and status in ('approved', 'going', 'paid');

  db_status := case
    when p_status in ('left', 'declined') then 'left'
    when p_status in ('interested', 'waitlist') then 'pending'
    when event_row.join_type = 'direct'
         and (event_row.max_participants is null or occupied < event_row.max_participants)
      then 'approved'
    else 'pending'
  end;

  insert into public.tbl_event_participants(
    event_id, user_id, status, responded_at, joined_at
  )
  values (
    p_event_id,
    me,
    db_status,
    case when db_status = 'approved' then now() end,
    case when db_status = 'approved' then now() end
  )
  on conflict(event_id, user_id) do update
    set status = excluded.status,
        responded_at = excluded.responded_at,
        joined_at = excluded.joined_at
  returning * into result_row;

  return result_row;
end
$function$;

create or replace function public.respond_activity_join(
  p_event_id integer,
  p_user_id integer,
  p_status text
)
returns public.tbl_event_participants
language plpgsql
security definer
set search_path = public
as $function$
declare
  me integer := public.get_current_app_user_id();
  event_row public.tbl_events;
  normalized_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  select * into event_row
  from public.tbl_events
  where id = p_event_id and created_by = me
  for update;

  if event_row.id is null then
    raise exception 'Only the host can respond' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'waitlist') then
    raise exception 'Invalid response';
  end if;

  normalized_status := case
    when p_status = 'waitlist' then 'pending'
    else p_status
  end;

  if normalized_status = 'approved' and event_row.max_participants is not null then
    select count(*) into occupied
    from public.tbl_event_participants
    where event_id = p_event_id
      and user_id <> p_user_id
      and status in ('approved', 'going', 'paid');
    if occupied >= event_row.max_participants then
      raise exception 'Activity is full';
    end if;
  end if;

  update public.tbl_event_participants
  set status = normalized_status,
      responded_at = now(),
      joined_at = case
        when normalized_status = 'approved' then coalesce(joined_at, now())
        else null
      end
  where event_id = p_event_id and user_id = p_user_id
  returning * into result_row;

  if result_row.id is null then
    raise exception 'Join request not found';
  end if;
  return result_row;
end
$function$;

comment on column public.tbl_events.price is
  'Informational participation price in INR, payable onsite to the organizer; not an in-app checkout amount.';

notify pgrst, 'reload schema';
