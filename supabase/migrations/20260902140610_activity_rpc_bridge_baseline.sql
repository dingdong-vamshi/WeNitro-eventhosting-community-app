-- Transactional legacy activity mutations used by activities-production.ts.
alter function public.is_wenitro_admin() set search_path=public;
alter table public.tbl_events add column if not exists status varchar(20) not null default 'published';

create or replace function public.create_activity(p_payload jsonb,p_status text default 'published') returns integer language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); eid integer; cid integer; cat text:=nullif(trim(p_payload->>'category'),''); cover text:=nullif(trim(p_payload->>'cover_url'),'');
begin
 if p_status not in ('draft','published') then raise exception 'Invalid activity status'; end if;
 if nullif(trim(p_payload->>'title'),'') is null then raise exception 'Title is required'; end if;
 if p_payload ? 'max_participants' and (p_payload->>'max_participants')::integer<1 then raise exception 'Capacity must be positive'; end if;
 insert into public.tbl_events(created_by,updated_by,title,description,event_start_time,event_end_time,registration_close_time,max_participants,visibility_type,join_type,location,display_location,latitude,longitude,is_paid,price,currency,intent,status,media)
 values(me,me,trim(p_payload->>'title'),nullif(trim(p_payload->>'description'),''),nullif(p_payload->>'event_start_time','')::timestamptz,nullif(p_payload->>'event_end_time','')::timestamptz,nullif(p_payload->>'registration_close_time','')::timestamptz,coalesce((p_payload->>'max_participants')::integer,25),coalesce(nullif(p_payload->>'visibility_type',''),'public'),'direct',nullif(p_payload->>'location',''),nullif(p_payload->>'display_location',''),nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,coalesce((p_payload->>'is_paid')::boolean,false),coalesce((p_payload->>'price_inr')::numeric,0),'INR',coalesce(nullif(p_payload->>'activity_type',''),nullif(p_payload->>'intent','')),p_status,case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end)
 returning id into eid;
 if cat is not null then select id into cid from public.tbl_categories where lower(name)=lower(cat) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if; insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(eid,cid,me,me) on conflict do nothing; end if;
 if nullif(p_payload->>'community_id','') is not null then update public.tbl_chat_rooms set event_id=eid,updated_at=now() where id=(p_payload->>'community_id')::integer and room_type='community' and created_by=me; end if;
 return eid;
end $$;

create or replace function public.update_activity(p_event_id integer,p_patch jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); cat text:=nullif(trim(p_patch->>'category'),''); cid integer; cover text:=nullif(trim(p_patch->>'cover_url'),'');
begin
 if not exists(select 1 from public.tbl_events where id=p_event_id and created_by=me) then raise exception 'Activity not found or not owned' using errcode='42501'; end if;
 if p_patch ? 'status' and p_patch->>'status' not in ('draft','published','cancelled') then raise exception 'Invalid activity status'; end if;
 update public.tbl_events set
  title=case when p_patch?'title' then trim(p_patch->>'title') else title end,
  description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,
  event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,
  event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,
  registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,
  max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,
  visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,
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
  updated_by=me,updated_at=now()
 where id=p_event_id;
 if cat is not null then select id into cid from public.tbl_categories where lower(name)=lower(cat) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if; delete from public.tbl_event_categories where event_id=p_event_id; insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me); end if;
 return p_event_id;
end $$;

create or replace function public.request_join_activity(p_event_id integer,p_status text default 'going') returns public.tbl_event_participants language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); e public.tbl_events; dbstatus text; r public.tbl_event_participants; approved_count integer;
begin
 select * into e from public.tbl_events where id=p_event_id and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false);
 if e.id is null then raise exception 'Activity is unavailable'; end if;
 if e.created_by=me then raise exception 'Hosts cannot join their own activity'; end if;
 if e.registration_close_time is not null and e.registration_close_time<now() and p_status not in ('left','declined') then raise exception 'Registration is closed'; end if;
 select count(*) into approved_count from public.tbl_event_participants where event_id=p_event_id and status='approved';
 dbstatus:=case when p_status in ('left','declined') then 'left' when p_status in ('interested','waitlist') then 'pending' when p_status='going' and e.join_type='direct' and (e.max_participants is null or approved_count<e.max_participants) then 'approved' else 'pending' end;
 insert into public.tbl_event_participants(event_id,user_id,status,responded_at,joined_at) values(p_event_id,me,dbstatus,case when dbstatus in ('approved','rejected') then now() end,case when dbstatus='approved' then now() end)
 on conflict(event_id,user_id) do update set status=excluded.status,responded_at=excluded.responded_at,joined_at=excluded.joined_at returning * into r;
 return r;
end $$;

create or replace function public.respond_activity_join(p_event_id integer,p_user_id integer,p_status text) returns public.tbl_event_participants language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); s text; r public.tbl_event_participants; cap integer; used integer;
begin
 select max_participants into cap from public.tbl_events where id=p_event_id and created_by=me; if not found then raise exception 'Only the host can respond' using errcode='42501'; end if;
 if p_status not in ('approved','rejected','waitlist') then raise exception 'Invalid response'; end if; s:=case when p_status='waitlist' then 'pending' else p_status end;
 if s='approved' and cap is not null then select count(*) into used from public.tbl_event_participants where event_id=p_event_id and status='approved' and user_id<>p_user_id; if used>=cap then raise exception 'Activity is full'; end if; end if;
 update public.tbl_event_participants set status=s,responded_at=now(),joined_at=case when s='approved' then coalesce(joined_at,now()) else joined_at end where event_id=p_event_id and user_id=p_user_id returning * into r;
 if r.id is null then raise exception 'Join request not found'; end if; return r;
end $$;
create or replace function public.cancel_activity(p_event_id integer) returns void language plpgsql security definer set search_path=public as $$ declare me integer:=public.get_current_app_user_id(); begin update public.tbl_events set is_cancelled=true,status='cancelled',updated_by=me,updated_at=now() where id=p_event_id and created_by=me; if not found then raise exception 'Activity not found or not owned' using errcode='42501'; end if; end $$;

revoke all on function public.create_activity(jsonb,text),public.update_activity(integer,jsonb),public.request_join_activity(integer,text),public.respond_activity_join(integer,integer,text),public.cancel_activity(integer) from public,anon;
grant execute on function public.create_activity(jsonb,text),public.update_activity(integer,jsonb),public.request_join_activity(integer,text),public.respond_activity_join(integer,integer,text),public.cancel_activity(integer) to authenticated;
