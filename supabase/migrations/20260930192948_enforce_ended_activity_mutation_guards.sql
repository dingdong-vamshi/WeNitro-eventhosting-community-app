-- Enforce ended-state restrictions at the server boundary, not only in UI.
create or replace function private.assert_activity_mutable(p_event_id integer)
returns void language plpgsql security definer set search_path='' as $$
declare e public.tbl_events;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into e from public.tbl_events where id=p_event_id for update;
  if e.id is null or coalesce(e.is_deleted,false) or coalesce(e.is_cancelled,false) or e.status='cancelled' then
    raise exception 'Activity is unavailable' using errcode='42501';
  end if;
  if e.status='completed' or (e.event_end_time is not null and e.event_end_time<=now()) then
    raise exception 'Activity has ended and cannot be changed' using errcode='42501';
  end if;
end $$;
revoke all on function private.assert_activity_mutable(integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.request_join_activity(p_event_id integer, p_status text DEFAULT 'going'::text)
 RETURNS tbl_event_participants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me integer:=public.get_current_app_user_id();
  event_row public.tbl_events;
  existing public.tbl_event_participants;
  db_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  perform private.assert_activity_mutable(p_event_id);
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null then raise exception 'Activity is unavailable'; end if;
  select * into existing from public.tbl_event_participants
  where event_id=p_event_id and user_id=me for update;

  if p_status in ('left','declined') then
    if existing.id is null then raise exception 'No participation exists to leave'; end if;
    update public.tbl_event_participants
    set status='left',responded_at=now(),joined_at=null
    where id=existing.id returning * into result_row;
    update public.tbl_activity_payments
    set status='cancelled',provider_status=coalesce(provider_status,'USER_WITHDREW'),updated_at=now()
    where event_id=p_event_id and user_id=me
      and status in ('created','pending') and checkout_expires_at>now();
    return result_row;
  end if;

  if p_status not in ('going','interested','waitlist') then
    raise exception 'Invalid participation status';
  end if;
  if event_row.status<>'published' or coalesce(event_row.is_deleted,false)
     or coalesce(event_row.is_cancelled,false) then
    raise exception 'Activity is unavailable';
  end if;
  if event_row.visibility_type<>'public' and existing.id is null then
    raise exception 'Use a valid invitation to join this private activity' using errcode='42501';
  end if;
  if event_row.created_by=me then raise exception 'Hosts cannot join their own activity'; end if;
  if event_row.registration_close_time is not null
     and event_row.registration_close_time<now() then
    raise exception 'Registration is closed';
  end if;
  perform private.assert_registration_complete(p_event_id,me);
  occupied:=private.activity_occupied_count(p_event_id,me);
  db_status:=case
    when p_status in ('interested','waitlist') then 'pending'
    when event_row.max_participants is not null and occupied>=event_row.max_participants then 'pending'
    when event_row.join_type='approval' then 'pending'
    when event_row.is_paid and event_row.payment_collection_mode='cashfree' then 'payment_required'
    else 'approved' end;
  insert into public.tbl_event_participants(event_id,user_id,status,responded_at,joined_at)
  values(
    p_event_id,me,db_status,
    case when db_status='approved' then now() end,
    case when db_status='approved' then now() end
  )
  on conflict(event_id,user_id) do update set
    status=excluded.status,responded_at=excluded.responded_at,joined_at=excluded.joined_at
  returning * into result_row;
  return result_row;
end $function$;

CREATE OR REPLACE FUNCTION public.respond_activity_join(p_event_id integer, p_user_id integer, p_status text)
 RETURNS tbl_event_participants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me integer:=public.get_current_app_user_id();
  event_row public.tbl_events;
  normalized_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  perform private.assert_activity_mutable(p_event_id);
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null or not private.can_manage_activity(p_event_id,me) then
    raise exception 'Only a host or co-host can respond' using errcode='42501';
  end if;
  if p_status not in ('approved','rejected','waitlist') then
    raise exception 'Invalid response';
  end if;
  normalized_status:=case
    when p_status='waitlist' then 'pending'
    when p_status='approved' and event_row.is_paid and event_row.payment_collection_mode='cashfree' then 'payment_required'
    else p_status end;
  if normalized_status in ('approved','payment_required')
     and event_row.max_participants is not null then
    occupied:=private.activity_occupied_count(p_event_id,p_user_id);
    if occupied>=event_row.max_participants then raise exception 'Activity is full'; end if;
  end if;
  update public.tbl_event_participants set
    status=normalized_status,responded_at=now(),
    joined_at=case when normalized_status='approved' then coalesce(joined_at,now()) else null end
  where event_id=p_event_id and user_id=p_user_id returning * into result_row;
  if result_row.id is null then raise exception 'Join request not found'; end if;
  perform private.enqueue_notification(
    p_user_id,'activity_join_decision',
    case when normalized_status='payment_required' then 'Activity request approved — payment required'
      when normalized_status='approved' then 'Activity request approved'
      when normalized_status='rejected' then 'Activity request declined'
      else 'Activity request waitlisted' end,
    case when normalized_status='payment_required' then
      'Complete secure payment to confirm your place. A seat is reserved only while checkout is active.'
    else 'Your activity request status was updated.' end,
    p_event_id::text,me,jsonb_build_object('event_id',p_event_id,'status',normalized_status)
  );
  return result_row;
end $function$;

CREATE OR REPLACE FUNCTION public.set_activity_cohost(p_event_id integer, p_user_id integer, p_cohost boolean)
 RETURNS tbl_event_participants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me integer := public.get_current_app_user_id(); r public.tbl_event_participants;
begin
  perform private.assert_activity_mutable(p_event_id);
  if not exists(select 1 from public.tbl_events e where e.id=p_event_id and e.created_by=me and not coalesce(e.is_deleted,false)) then
    raise exception 'Only the host can assign a co-host.' using errcode='42501';
  end if;
  if p_user_id=me then raise exception 'You are already the host.'; end if;
  update public.tbl_event_participants
  set role=case when p_cohost then 'cohost' else 'participant' end
  where event_id=p_event_id and user_id=p_user_id and status in ('approved','going','paid')
  returning * into r;
  if r is null then raise exception 'Choose an approved participant.'; end if;
  return r;
end
$function$;

CREATE OR REPLACE FUNCTION public.update_activity(p_event_id integer, p_patch jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me integer:=public.get_current_app_user_id(); cat text:=nullif(trim(p_patch->>'category'),''); cid integer; cover text:=nullif(trim(p_patch->>'cover_url'),'');
begin
  perform private.assert_activity_mutable(p_event_id);
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Activity patch must be an object' using errcode='22023'; end if;
  if not private.can_manage_activity(p_event_id,me) then raise exception 'Activity not found or not manageable' using errcode='42501'; end if;
  update public.tbl_events set
    title=case when p_patch?'title' then trim(p_patch->>'title') else title end,
    description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,
    event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,
    event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,
    registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,
    max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,
    visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,
    join_type=case when p_patch?'join_type' then p_patch->>'join_type' else join_type end,
    location=case when p_patch?'location' then nullif(p_patch->>'location','') else location end,
    display_location=case when p_patch?'display_location' then nullif(p_patch->>'display_location','') else display_location end,
    latitude=case when p_patch?'latitude' then nullif(p_patch->>'latitude','')::numeric else latitude end,
    longitude=case when p_patch?'longitude' then nullif(p_patch->>'longitude','')::numeric else longitude end,
    is_paid=case when p_patch?'is_paid' then (p_patch->>'is_paid')::boolean else is_paid end,
    price=case when p_patch?'price_inr' then (p_patch->>'price_inr')::numeric else price end,
    intent=case when p_patch?'activity_type' then p_patch->>'activity_type' else intent end,
    status=case when p_patch?'status' then p_patch->>'status' else status end,
    is_cancelled=case when p_patch->>'status'='cancelled' then true else is_cancelled end,
    media=case when p_patch?'cover_url' then case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end else media end,
    verified_only=case when p_patch?'verified_only' then (p_patch->>'verified_only')::boolean else verified_only end,
    age_min=case when p_patch?'age_min' then nullif(p_patch->>'age_min','')::integer else age_min end,
    age_max=case when p_patch?'age_max' then nullif(p_patch->>'age_max','')::integer else age_max end,
    gender_preference=case when p_patch?'gender_preference' then nullif(p_patch->>'gender_preference','') else gender_preference end,
    location_instruction=case when p_patch?'location_instruction' then nullif(trim(p_patch->>'location_instruction'),'') else location_instruction end,
    costs_may_apply=case when p_patch?'costs_may_apply' then (p_patch->>'costs_may_apply')::boolean else costs_may_apply end,
    entry_fee_required=case when p_patch?'entry_fee_required' then (p_patch->>'entry_fee_required')::boolean else entry_fee_required end,
    updated_by=me,updated_at=now()
  where id=p_event_id;
  if cat is not null then
    select id into cid from public.tbl_categories where lower(trim(name))=lower(cat) order by id limit 1;
    if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if;
    delete from public.tbl_event_categories where event_id=p_event_id;
    insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me);
  end if;
  if p_patch?'registration_questions' then perform private.save_activity_registration_questions(p_event_id,p_patch->'registration_questions'); end if;
  return p_event_id;
end
$function$;
