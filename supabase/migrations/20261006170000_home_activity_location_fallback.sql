create or replace function private.activity_location_city(p_location text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[];
  candidate text;
  normalized text;
  index integer;
begin
  normalized := trim(split_part(coalesce(p_location, ''), '·', 1));
  if normalized = '' or normalized = 'Google Maps venue' then return null; end if;
  parts := regexp_split_to_array(normalized, '\s*,\s*');
  if coalesce(array_length(parts, 1), 0) < 2 then return null; end if;

  for index in reverse coalesce(array_length(parts, 1), 0)..1 loop
    candidate := trim(parts[index]);
    continue when candidate = ''
      or candidate ~ '^[0-9]{5,6}$'
      or lower(candidate) in (
        'india', 'bharat', 'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar',
        'chhattisgarh', 'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand',
        'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya',
        'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
        'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
        'andaman and nicobar islands', 'chandigarh', 'dadra and nagar haveli and daman and diu',
        'delhi', 'jammu and kashmir', 'ladakh', 'lakshadweep', 'puducherry'
      )
      or lower(candidate) ~ '(district|subdistrict|mandal|taluk|tehsil|county|ward)$';
    if length(candidate) between 2 and 80 then return candidate; end if;
  end loop;
  return null;
end
$$;

create or replace function public.home_location_fallback()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  city text;
begin
  select private.activity_location_city(coalesce(event.display_location, event.location))
  into city
  from public.tbl_event_participants participant
  join public.tbl_events event on event.id = participant.event_id
  where participant.user_id = me
    and participant.status = 'approved'
    and not coalesce(event.is_deleted, false)
    and not coalesce(event.is_cancelled, false)
    and event.event_end_time is not null
    and event.event_end_time <= now()
    and private.activity_location_city(coalesce(event.display_location, event.location)) is not null
  order by event.event_end_time desc, participant.joined_at desc nulls last, participant.id desc
  limit 1;

  if city is null then return null; end if;
  return jsonb_build_object('locality', city, 'source', 'activity');
end
$$;

revoke all on function private.activity_location_city(text) from public, anon, authenticated;
revoke all on function public.home_location_fallback() from public, anon;
grant execute on function public.home_location_fallback() to authenticated;

comment on function public.home_location_fallback() is
  'Returns only the current user''s most recent completed, approved participant activity city for the Home location fallback.';
