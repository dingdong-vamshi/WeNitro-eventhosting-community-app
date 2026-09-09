begin;

create or replace function public.create_activity(
  p_payload jsonb,
  p_status text default 'published'
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
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
    nullif(
      trim(coalesce(p_payload->>'join_type', p_payload->>'join_method')),
      ''
    )
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
    longitude, is_paid, price, currency, intent, status, media
  )
  values(
    me,
    me,
    trim(p_payload->>'title'),
    nullif(trim(p_payload->>'description'), ''),
    nullif(p_payload->>'event_start_time', '')::timestamptz,
    nullif(p_payload->>'event_end_time', '')::timestamptz,
    nullif(p_payload->>'registration_close_time', '')::timestamptz,
    coalesce((p_payload->>'max_participants')::integer, 25),
    coalesce(nullif(p_payload->>'visibility_type', ''), 'public'),
    normalized_join_type,
    nullif(p_payload->>'location', ''),
    nullif(p_payload->>'display_location', ''),
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    coalesce((p_payload->>'is_paid')::boolean, false),
    coalesce((p_payload->>'price_inr')::numeric, 0),
    'INR',
    coalesce(
      nullif(p_payload->>'activity_type', ''),
      nullif(p_payload->>'intent', '')
    ),
    p_status,
    case
      when cover is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('url', cover, 'type', 'image'))
    end
  )
  returning id into eid;

  if cat is not null then
    select id
    into cid
    from public.tbl_categories
    where lower(name) = lower(cat)
    order by id
    limit 1;

    if cid is null then
      insert into public.tbl_categories(name)
      values(cat)
      returning id into cid;
    end if;

    insert into public.tbl_event_categories(
      event_id, category_id, created_by, updated_by
    )
    values(eid, cid, me, me)
    on conflict do nothing;
  end if;

  if nullif(p_payload->>'community_id', '') is not null then
    update public.tbl_chat_rooms
    set event_id = eid,
        updated_at = now()
    where id = (p_payload->>'community_id')::integer
      and room_type = 'community'
      and created_by = me;
  end if;

  return eid;
end
$function$;

revoke all on function public.create_activity(jsonb, text) from public, anon;
grant execute on function public.create_activity(jsonb, text)
  to authenticated, service_role;

do $migration$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = 'public.tbl_chat_participants'::regclass
  ) then
    alter publication supabase_realtime
      add table public.tbl_chat_participants;
  end if;
end
$migration$;

commit;
