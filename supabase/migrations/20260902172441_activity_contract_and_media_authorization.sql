-- Align the legacy Activity contract and constrain private media reads.
create or replace function public.create_activity(p_payload jsonb,p_status text default 'published') returns integer language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); eid integer; cid integer; cat text:=nullif(trim(p_payload->>'category'),''); cover text:=nullif(trim(p_payload->>'cover_url'),'');
begin
 if p_status not in ('draft','published') then raise exception 'Invalid activity status'; end if;
 if nullif(trim(p_payload->>'title'),'') is null then raise exception 'Title is required'; end if;
 insert into public.tbl_events(created_by,updated_by,title,description,event_start_time,event_end_time,registration_close_time,max_participants,visibility_type,join_type,location,display_location,latitude,longitude,is_paid,price,currency,intent,status,media)
 values(me,me,trim(p_payload->>'title'),nullif(trim(p_payload->>'description'),''),nullif(p_payload->>'event_start_time','')::timestamptz,nullif(p_payload->>'event_end_time','')::timestamptz,nullif(p_payload->>'registration_close_time','')::timestamptz,coalesce((p_payload->>'max_participants')::integer,25),coalesce(nullif(p_payload->>'visibility_type',''),'public'),coalesce(nullif(p_payload->>'join_type',''),'direct'),nullif(p_payload->>'location',''),nullif(p_payload->>'display_location',''),nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,coalesce((p_payload->>'is_paid')::boolean,false),coalesce((p_payload->>'price_inr')::numeric,0),'INR',coalesce(nullif(p_payload->>'activity_type',''),nullif(p_payload->>'intent','')),p_status,case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end)
 returning id into eid;
 if cat is not null then select id into cid from public.tbl_categories where lower(name)=lower(cat) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if; insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(eid,cid,me,me) on conflict do nothing; end if;
 if nullif(p_payload->>'community_id','') is not null then update public.tbl_chat_rooms set event_id=eid,updated_at=now() where id=(p_payload->>'community_id')::integer and room_type='community' and created_by=me; end if;
 return eid;
end $$;

create or replace function public.update_activity(p_event_id integer,p_patch jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); cat text:=nullif(trim(p_patch->>'category'),''); cid integer; cover text:=nullif(trim(p_patch->>'cover_url'),'');
begin
 if not exists(select 1 from public.tbl_events where id=p_event_id and created_by=me) then raise exception 'Activity not found or not owned' using errcode='42501'; end if;
 update public.tbl_events set title=case when p_patch?'title' then trim(p_patch->>'title') else title end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,join_type=case when p_patch?'join_type' then p_patch->>'join_type' else join_type end,location=case when p_patch?'location' then nullif(p_patch->>'location','') else location end,display_location=case when p_patch?'display_location' then nullif(p_patch->>'display_location','') else display_location end,latitude=case when p_patch?'latitude' then nullif(p_patch->>'latitude','')::numeric else latitude end,longitude=case when p_patch?'longitude' then nullif(p_patch->>'longitude','')::numeric else longitude end,is_paid=case when p_patch?'is_paid' then (p_patch->>'is_paid')::boolean else is_paid end,price=case when p_patch?'price_inr' then (p_patch->>'price_inr')::numeric else price end,intent=case when p_patch?'activity_type' then p_patch->>'activity_type' else intent end,status=case when p_patch?'status' then p_patch->>'status' else status end,is_cancelled=case when p_patch->>'status'='cancelled' then true else is_cancelled end,media=case when p_patch?'cover_url' then case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end else media end,updated_by=me,updated_at=now() where id=p_event_id;
 if cat is not null then select id into cid from public.tbl_categories where lower(name)=lower(cat) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if; delete from public.tbl_event_categories where event_id=p_event_id; insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me); end if;
 return p_event_id;
end $$;

revoke execute on function public.admin_list_users() from anon;

drop policy if exists public_events_read on public.tbl_events;
create policy public_events_read on public.tbl_events for select to anon using(visibility_type='public' and status='published' and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false));
drop policy if exists app_events_read on public.tbl_events;
create policy app_events_read on public.tbl_events for select to authenticated using(not coalesce(is_deleted,false) and ((status='published' and visibility_type='public') or created_by=public.current_app_user_id() or public.is_event_participant(id)));

drop policy if exists vibes_read on public.tbl_activity_vibes;
create policy vibes_read on public.tbl_activity_vibes for select to authenticated using(visibility='public' or user_id=public.current_app_user_id() or public.is_wenitro_admin() or (visibility='activity' and exists(select 1 from public.tbl_events e where e.id=event_id and (e.created_by=public.current_app_user_id() or public.is_event_participant(e.id)))));

create or replace function private.can_read_media(p_bucket text,p_name text,p_owner_id text) returns boolean language sql stable security definer set search_path=public,private,storage as $$
 select p_owner_id=auth.uid()::text or public.is_wenitro_admin() or case
  when p_bucket='messages' then exists(select 1 from public.tbl_messages m where m.media_url=p_name and public.is_chat_member(m.room_id))
  when p_bucket='verification' then exists(select 1 from public.tbl_user_verification v where v.document_path=p_name and v.user_id=public.current_app_user_id())
  when p_bucket='vibes' then exists(select 1 from public.tbl_activity_vibes v where v.media_url=p_name and (v.visibility='public' or v.user_id=public.current_app_user_id() or (v.visibility='activity' and exists(select 1 from public.tbl_events e where e.id=v.event_id and (e.created_by=public.current_app_user_id() or public.is_event_participant(e.id))))))
  when p_bucket='stories' then exists(select 1 from public.tbl_stories s where s.media_url=p_name and s.deleted_at is null and s.expires_at>now())
  when p_bucket in ('community','communities') then exists(select 1 from public.tbl_chat_rooms r where (r.image_url=p_name or r.cover_url=p_name) and (r.visibility='public' or r.created_by=public.current_app_user_id() or public.is_chat_member(r.id))) or exists(select 1 from public.tbl_community_posts p where p.media_url=p_name and public.is_chat_member(p.room_id) and p.deleted_at is null)
  when p_bucket='activity-media' then exists(select 1 from public.tbl_events e where (e.media->0->>'url')=p_name and ((e.status='published' and e.visibility_type='public') or e.created_by=public.current_app_user_id() or public.is_event_participant(e.id)))
  else false end;
$$;
revoke all on function private.can_read_media(text,text,text) from public,anon;
grant execute on function private.can_read_media(text,text,text) to authenticated;
drop policy if exists private_media_read on storage.objects;
create policy private_media_read on storage.objects for select to authenticated using(private.can_read_media(bucket_id,name,owner_id));
