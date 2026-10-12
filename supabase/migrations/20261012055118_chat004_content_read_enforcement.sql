-- Restrictive policies AND with every existing visibility/membership policy.
create policy chat004_moderation_read on public.tbl_events as restrictive for select to authenticated using (admin_moderation_status='active' or (select public.is_wenitro_admin()));
create policy chat004_moderation_anon_read on public.tbl_events as restrictive for select to anon using (admin_moderation_status='active');
create policy chat004_moderation_read on public.tbl_chat_rooms as restrictive for select to authenticated using (admin_moderation_status='active' or (select public.is_wenitro_admin()));
create policy chat004_moderation_anon_read on public.tbl_chat_rooms as restrictive for select to anon using (admin_moderation_status='active');
create policy chat004_moderation_read on public.tbl_activity_vibes as restrictive for select to authenticated using (admin_moderation_status='active' or (select public.is_wenitro_admin()));
create policy chat004_moderation_anon_read on public.tbl_activity_vibes as restrictive for select to anon using (admin_moderation_status='active');
create policy chat004_moderation_read on public.tbl_stories as restrictive for select to authenticated using (admin_moderation_status='active' or (select public.is_wenitro_admin()));
create policy chat004_moderation_anon_read on public.tbl_stories as restrictive for select to anon using (admin_moderation_status='active');
create or replace function private.can_read_media(p_bucket text,p_name text,p_owner_id text) returns boolean language sql stable security definer set search_path=public,private,storage as $$
 select p_owner_id=auth.uid()::text or public.is_wenitro_admin() or case
  when p_bucket='messages' then exists(select 1 from public.tbl_messages m where m.media_url=p_name and public.is_chat_member(m.room_id))
  when p_bucket='verification' then exists(select 1 from public.tbl_user_verification v where v.document_path=p_name and v.user_id=public.current_app_user_id())
  when p_bucket='vibes' then exists(select 1 from public.tbl_activity_vibes v where v.media_url=p_name and v.admin_moderation_status='active' and (v.visibility='public' or v.user_id=public.current_app_user_id() or (v.visibility='activity' and exists(select 1 from public.tbl_events e where e.id=v.event_id and (e.created_by=public.current_app_user_id() or public.is_event_participant(e.id))))))
  when p_bucket='stories' then exists(select 1 from public.tbl_stories s where s.media_url=p_name and s.admin_moderation_status='active' and s.deleted_at is null and s.expires_at>now())
  when p_bucket in ('community','communities') then exists(select 1 from public.tbl_chat_rooms r where (r.image_url=p_name or r.cover_url=p_name) and r.admin_moderation_status='active' and (r.visibility='public' or r.created_by=public.current_app_user_id() or public.is_chat_member(r.id))) or exists(select 1 from public.tbl_community_posts p where p.media_url=p_name and exists(select 1 from public.tbl_chat_rooms r where r.id=p.room_id and r.admin_moderation_status='active') and public.is_chat_member(p.room_id) and p.deleted_at is null)
  when p_bucket='activity-media' then exists(select 1 from public.tbl_events e where (e.media->0->>'url')=p_name and e.admin_moderation_status='active' and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false) and ((e.status='published' and e.visibility_type='public') or e.created_by=public.current_app_user_id() or public.is_event_participant(e.id)))
  else false end;
$$;

-- These legacy reads are SECURITY DEFINER and therefore need explicit filtering.
create or replace function public.list_active_stories(p_limit integer default 50,p_before_created_at timestamptz default null,p_before_id bigint default null)
returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(s)||jsonb_build_object('owner',jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image),
 'viewed',exists(select 1 from public.tbl_story_views sv where sv.story_id=s.id and sv.viewer_id=public.current_app_user_id()))
 from public.tbl_stories s join public.tbl_users u on u.id=s.user_id
 where private.account_is_allowed() and s.admin_moderation_status='active' and s.deleted_at is null and s.expires_at>now()
 and (p_before_created_at is null or (s.created_at,s.id)<(p_before_created_at,coalesce(p_before_id,9223372036854775807::bigint)))
 order by s.created_at desc,s.id desc limit least(greatest(coalesce(p_limit,50),1),100)
$$;
create or replace function public.list_my_stories(p_include_expired boolean default false)
returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(s)||jsonb_build_object('view_count',(select count(*) from public.tbl_story_views sv where sv.story_id=s.id))
 from public.tbl_stories s where s.user_id=public.get_current_app_user_id() and s.admin_moderation_status='active'
 and s.deleted_at is null and (p_include_expired or s.expires_at>now()) order by s.created_at desc,s.id desc
$$;
notify pgrst,'reload schema';
