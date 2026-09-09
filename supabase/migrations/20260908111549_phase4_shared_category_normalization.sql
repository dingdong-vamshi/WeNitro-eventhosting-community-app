-- Normalize existing category names only; retain all activity/payment/Partner authorization.
CREATE OR REPLACE FUNCTION public.create_activity(p_payload jsonb, p_status text DEFAULT 'published'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me integer := public.get_current_app_user_id();
  eid integer;
  cid integer;
  cat text := nullif(trim(p_payload->>'category'), '');
  cover text := nullif(trim(p_payload->>'cover_url'), '');
  raw_join_type text;
  normalized_join_type text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Activity payload must be an object' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'Invalid activity status' using errcode = '22023';
  end if;
  if nullif(trim(p_payload->>'title'), '') is null then
    raise exception 'Title is required' using errcode = '22023';
  end if;

  raw_join_type := lower(
    nullif(trim(coalesce(p_payload->>'join_type', p_payload->>'join_method')), '')
  );
  normalized_join_type := case raw_join_type
    when 'direct' then 'direct'
    when 'approval' then 'approval'
    when 'approval_required' then 'approval'
    when 'host_approval' then 'approval'
    when 'host_approval_required' then 'approval'
    else null
  end;
  if normalized_join_type is null then
    raise exception 'join_type is required and must be direct or approval'
      using errcode = '22023';
  end if;

  insert into public.tbl_events(
    created_by, updated_by, title, description, event_start_time,
    event_end_time, registration_close_time, max_participants,
    visibility_type, join_type, location, display_location, latitude,
    longitude, verified_only, age_min, age_max, gender_preference, location_instruction, is_paid, price, currency, intent, status, media
  )
  values(
    me, me, trim(p_payload->>'title'),
    nullif(trim(p_payload->>'description'), ''),
    nullif(p_payload->>'event_start_time', '')::timestamptz,
    nullif(p_payload->>'event_end_time', '')::timestamptz,
    nullif(p_payload->>'registration_close_time', '')::timestamptz,
    case when p_payload ? 'max_participants' then (p_payload->>'max_participants')::integer else 25 end,
    coalesce(nullif(p_payload->>'visibility_type', ''), 'public'),
    normalized_join_type,
    nullif(p_payload->>'location', ''),
    nullif(p_payload->>'display_location', ''),
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    coalesce((p_payload->>'verified_only')::boolean, false),
    nullif(p_payload->>'age_min','')::integer,
    nullif(p_payload->>'age_max','')::integer,
    nullif(p_payload->>'gender_preference',''),
    nullif(trim(p_payload->>'location_instruction'),''),
    coalesce((p_payload->>'is_paid')::boolean, false),
    coalesce((p_payload->>'price_inr')::numeric, 0),
    'INR',
    coalesce(nullif(p_payload->>'activity_type', ''), nullif(p_payload->>'intent', '')),
    p_status,
    case when cover is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('url', cover, 'type', 'image'))
    end
  )
  returning id into eid;

  if cat is not null then
    select id into cid
    from public.tbl_categories
    where lower(trim(name)) = lower(cat)
    order by id
    limit 1;
    if cid is null then
      insert into public.tbl_categories(name) values(cat) returning id into cid;
    end if;
    insert into public.tbl_event_categories(event_id, category_id, created_by, updated_by)
    values(eid, cid, me, me)
    on conflict do nothing;
  end if;

  if nullif(p_payload->>'community_id', '') is not null then
    update public.tbl_chat_rooms
    set event_id = eid, updated_at = now()
    where id = (p_payload->>'community_id')::integer
      and room_type = 'community'
      and created_by = me;
  end if;
  if p_payload ? 'registration_questions' then perform private.save_activity_registration_questions(eid,p_payload->'registration_questions'); end if;
 return eid;
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
 if not exists(select 1 from public.tbl_events where id=p_event_id and created_by=me) then raise exception 'Activity not found or not owned' using errcode='42501'; end if;
 update public.tbl_events set title=case when p_patch?'title' then trim(p_patch->>'title') else title end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,join_type=case when p_patch?'join_type' then p_patch->>'join_type' else join_type end,location=case when p_patch?'location' then nullif(p_patch->>'location','') else location end,display_location=case when p_patch?'display_location' then nullif(p_patch->>'display_location','') else display_location end,latitude=case when p_patch?'latitude' then nullif(p_patch->>'latitude','')::numeric else latitude end,longitude=case when p_patch?'longitude' then nullif(p_patch->>'longitude','')::numeric else longitude end,is_paid=case when p_patch?'is_paid' then (p_patch->>'is_paid')::boolean else is_paid end,price=case when p_patch?'price_inr' then (p_patch->>'price_inr')::numeric else price end,intent=case when p_patch?'activity_type' then p_patch->>'activity_type' else intent end,status=case when p_patch?'status' then p_patch->>'status' else status end,is_cancelled=case when p_patch->>'status'='cancelled' then true else is_cancelled end,media=case when p_patch?'cover_url' then case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end else media end,verified_only=case when p_patch?'verified_only' then (p_patch->>'verified_only')::boolean else verified_only end, age_min=case when p_patch?'age_min' then nullif(p_patch->>'age_min','')::integer else age_min end, age_max=case when p_patch?'age_max' then nullif(p_patch->>'age_max','')::integer else age_max end, gender_preference=case when p_patch?'gender_preference' then nullif(p_patch->>'gender_preference','') else gender_preference end, location_instruction=case when p_patch?'location_instruction' then nullif(trim(p_patch->>'location_instruction'),'') else location_instruction end, updated_by=me,updated_at=now() where id=p_event_id;
 if cat is not null then select id into cid from public.tbl_categories where lower(trim(name))=lower(cat) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if; delete from public.tbl_event_categories where event_id=p_event_id; insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me); end if;
 if p_patch ? 'registration_questions' then perform private.save_activity_registration_questions(p_event_id,p_patch->'registration_questions'); end if;
 return p_event_id;
end $function$;
