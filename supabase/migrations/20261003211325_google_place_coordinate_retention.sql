-- Google place IDs are durable; provider coordinates are a short-lived cache.
-- Names/addresses never enter this contract. No provider requests run in Cron.
alter table public.tbl_events
 add column location_source text not null default 'legacy' check(location_source in ('legacy','openstreetmap','google')),
 add column google_place_id text,
 add column location_coordinates_expires_at timestamptz;
create table private.google_place_coordinate_cache(
 place_id text primary key check(length(place_id) between 1 and 300 and place_id !~ '[[:cntrl:]]'),
 latitude numeric not null check(latitude between -90 and 90),
 longitude numeric not null check(longitude between -180 and 180),
 expires_at timestamptz not null
);
alter table private.google_place_coordinate_cache enable row level security;
revoke all on private.google_place_coordinate_cache from public,anon,authenticated,service_role;

-- Only the trusted Details Edge handler may populate this cache after a fetch.
create function public.cache_google_place_coordinates(p_place_id text,p_latitude double precision,p_longitude double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.google_place_coordinate_cache%rowtype;
begin
 if p_place_id is null or length(p_place_id) not between 1 and 300 or btrim(p_place_id)<>p_place_id or p_place_id ~ '[[:cntrl:]]'
  or p_latitude is null or not(p_latitude between -90 and 90)
  or p_longitude is null or not(p_longitude between -180 and 180) then
  raise exception 'Invalid Google place coordinate receipt' using errcode='22023';
 end if;
 insert into private.google_place_coordinate_cache(place_id,latitude,longitude,expires_at)
 values(p_place_id,p_latitude,p_longitude,clock_timestamp()+interval '28 days')
 on conflict(place_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,expires_at=excluded.expires_at
 returning * into receipt;
 -- A new trusted Details receipt renews existing references without editing the venue.
 update public.tbl_events set latitude=receipt.latitude,longitude=receipt.longitude,location_coordinates_expires_at=receipt.expires_at
 where location_source='google' and google_place_id=receipt.place_id;
 return jsonb_build_object('placeId',receipt.place_id,'latitude',receipt.latitude,'longitude',receipt.longitude,'expiresAt',receipt.expires_at);
end $$;
revoke all on function public.cache_google_place_coordinates(text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.cache_google_place_coordinates(text,double precision,double precision) to service_role;

create function private.bind_google_activity_coordinates()
returns trigger language plpgsql security definer set search_path='' as $$
declare receipt private.google_place_coordinate_cache%rowtype;
begin
 if new.location_source='google' then
  if new.google_place_id is null or length(new.google_place_id) not between 1 and 300 or btrim(new.google_place_id)<>new.google_place_id or new.google_place_id ~ '[[:cntrl:]]' then
   raise exception 'Google place ID is required' using errcode='22023';
  end if;
  select * into receipt from private.google_place_coordinate_cache where place_id=new.google_place_id and expires_at>clock_timestamp();
  new.location:='Google Maps venue';new.display_location:='Google Maps venue';
  if found then
   new.latitude:=receipt.latitude;new.longitude:=receipt.longitude;new.location_coordinates_expires_at:=receipt.expires_at;
  elsif tg_op='UPDATE' then
   if old.location_source='google' and old.google_place_id=new.google_place_id then
    -- An unrelated historical edit must not require provider traffic or extend TTL.
    new.latitude:=null;new.longitude:=null;new.location_coordinates_expires_at:=old.location_coordinates_expires_at;
   else raise exception 'Refresh this Google venue before saving' using errcode='22023';end if;
  else raise exception 'Refresh this Google venue before saving' using errcode='22023';end if;
 else
  new.google_place_id:=null;new.location_coordinates_expires_at:=null;
  if tg_op='UPDATE' then
   if old.location_source='google' then
    -- A source-only edit cannot turn cached provider coordinates into durable data.
    if new.latitude is not distinct from old.latitude then new.latitude:=null;end if;
    if new.longitude is not distinct from old.longitude then new.longitude:=null;end if;
    if new.location='Google Maps venue' then new.location:=null;end if;
    if new.display_location='Google Maps venue' then new.display_location:=null;end if;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.bind_google_activity_coordinates() from public,anon,authenticated,service_role;
create trigger a_google_activity_location_guard before insert or update on public.tbl_events
 for each row execute function private.bind_google_activity_coordinates();

-- Narrow edits preserve all existing authorization, checkout/category and
-- registration-question contracts. Fail migration rather than overwrite drift.
do $$
declare definition text; before_text text; after_text text; coordinate text;
begin
 select pg_get_functiondef('public.create_activity(jsonb,text)'::regprocedure) into definition;
 before_text:='longitude, verified_only';after_text:='longitude, location_source, google_place_id, verified_only';
 if position(before_text in definition)=0 then raise exception 'Unexpected create_activity column contract';end if;
 definition:=replace(definition,before_text,after_text);
 before_text:='    coalesce((p_payload->>''verified_only'')::boolean, false),';
 after_text:=E'    coalesce(p_payload->>''location_source'',''legacy''), nullif(p_payload->>''google_place_id'',''''),\n'||before_text;
 if position(before_text in definition)=0 then raise exception 'Unexpected create_activity values contract';end if;
 definition:=replace(definition,before_text,after_text);
 foreach coordinate in array array['latitude','longitude'] loop
  before_text:=format('nullif(p_payload->>''%s'', '''')::numeric',coordinate);
  if position(before_text in definition)=0 then raise exception 'Unexpected create coordinate contract';end if;
  definition:=replace(definition,before_text,'case when p_payload->>''location_source''=''google'' then null else '||before_text||' end');
 end loop;
 execute definition;
 select pg_get_functiondef('public.update_activity(integer,jsonb)'::regprocedure) into definition;
 before_text:='    location=case when p_patch?''location''';
 after_text:=E'    location_source=case when p_patch?''location_source'' then p_patch->>''location_source'' else location_source end,\n    google_place_id=case when p_patch?''google_place_id'' then nullif(p_patch->>''google_place_id'','''') else google_place_id end,\n'||before_text;
 if position(before_text in definition)=0 then raise exception 'Unexpected update_activity location contract';end if;
 definition:=replace(definition,before_text,after_text);
 foreach coordinate in array array['latitude','longitude'] loop
  before_text:=format('%s=case when p_patch?''%s'' then nullif(p_patch->>''%s'','''')::numeric else %s end',coordinate,coordinate,coordinate,coordinate);
  after_text:=format('%s=(case when coalesce(p_patch->>''location_source'',location_source)=''google'' then null when p_patch?''%s'' then nullif(p_patch->>''%s'','''') else %s::text end)::numeric',coordinate,coordinate,coordinate,coordinate);
  if position(before_text in definition)=0 then raise exception 'Unexpected update coordinate contract';end if;
  definition:=replace(definition,before_text,after_text);
 end loop;
 execute definition;
end $$;

create function private.purge_expired_google_coordinates()
returns jsonb language plpgsql security definer set search_path='' as $$
declare cache_count integer;event_count integer;
begin
 delete from private.google_place_coordinate_cache where expires_at<=clock_timestamp();get diagnostics cache_count=row_count;
 update public.tbl_events set latitude=null,longitude=null
 where location_source='google' and location_coordinates_expires_at<=clock_timestamp()
 and (latitude is not null or longitude is not null);get diagnostics event_count=row_count;
 return jsonb_build_object('cacheRowsRemoved',cache_count,'eventRowsCleared',event_count);
end $$;
revoke all on function private.purge_expired_google_coordinates() from public,anon,authenticated,service_role;
-- Existing project Cron extension; named schedule replaces the same job on retry.
select cron.schedule('wenitro-google-coordinate-retention','0 * * * *','select private.purge_expired_google_coordinates()');
