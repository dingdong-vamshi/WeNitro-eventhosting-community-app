-- Backward-compatible link IDs alongside the existing community-name array.
-- Uses the same profile guard and community visibility predicate as profile_contact.
create or replace function private.profile_contact(p_user_id integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.tbl_users; s public.tbl_user_privacy_settings; own boolean; friend boolean;
begin
  perform public.get_current_app_user_id();
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  select * into u from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
  if not found then raise exception 'Profile unavailable'; end if;
  select * into s from public.tbl_user_privacy_settings where user_id=p_user_id;
  own:=p_user_id=public.current_app_user_id(); friend:=private.in_squad(p_user_id);
  return jsonb_build_object(
    'id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image,
    'bio',u.bio,'occupation',u.occupation,'about',u.about,'location',u.nationality,'is_verified',u.isverified=1,
    'email',case when own or coalesce(s.email_visibility,'friends')='everyone' or (coalesce(s.email_visibility,'friends')='friends' and friend) then u.email else null end,
    'phone',case when own or coalesce(s.phone_visibility,'friends')='everyone' or (coalesce(s.phone_visibility,'friends')='friends' and friend) then coalesce(u.phone_e164,u.countrycode||u.phonenumber::text) else null end,
    'can_message',private.may_message(p_user_id),
    'social_links',(select jsonb_build_object('instagram',l.instagram,'facebook',l.facebook,'twitter',l.twitter,'linkedin',l.linkedin,'youtube',l.youtube) from public.tbl_user_social_links l where l.user_id=p_user_id order by l.id limit 1),
    'interests',coalesce((select jsonb_agg(c.name order by c.name) from public.tbl_user_interests i join public.tbl_categories c on c.id=i.category_id where i.user_id=p_user_id),'[]'::jsonb),
    'communities',coalesce((select jsonb_agg(r.title order by r.title) from public.tbl_chat_participants cp join public.tbl_chat_rooms r on r.id=cp.room_id where cp.user_id=p_user_id and r.room_type='community' and (r.visibility='public' or own)),'[]'::jsonb),
    'community_links',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.title) order by r.title,r.id) from public.tbl_chat_participants cp join public.tbl_chat_rooms r on r.id=cp.room_id where cp.user_id=p_user_id and r.room_type='community' and (r.visibility='public' or own)),'[]'::jsonb)
  );
end
$$;

-- A server-owned link binds the retained upload to the exact moderation decision.
alter table public.tbl_stories add column moderation_request_id uuid unique references private.content_moderation_requests(id);
alter table public.tbl_stories drop constraint tbl_stories_admin_moderation_status_check;
alter table public.tbl_stories add constraint tbl_stories_admin_moderation_status_check
 check(admin_moderation_status in ('active','hidden','removed','pending_review','rejected'));

create or replace function private.guard_story_review_link() returns trigger
language plpgsql security definer set search_path='' as $$
declare decision text;
begin
 if tg_op='INSERT' and new.moderation_request_id is not null and coalesce(auth.jwt()->>'role','')<>'service_role' then
  raise exception 'Only the safety service can attach a review' using errcode='42501';
 end if;
 if tg_op='UPDATE' then
  if new.moderation_request_id is distinct from old.moderation_request_id then raise exception 'Review link is immutable' using errcode='42501';end if;
  if old.moderation_request_id is not null and (new.caption is distinct from old.caption or new.media_url is distinct from old.media_url or new.media_type is distinct from old.media_type or new.user_id is distinct from old.user_id) then
   raise exception 'Reviewed Story content is immutable' using errcode='42501';
  end if;
 end if;
 if new.moderation_request_id is not null and new.admin_moderation_status='active' then
  select status into decision from private.content_moderation_requests where id=new.moderation_request_id;
  if decision is distinct from 'approved' then raise exception 'Approve the safety review before publishing this Story' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_story_review_link() from public,anon,authenticated;
create trigger zz_guard_story_review_link before insert or update on public.tbl_stories for each row execute function private.guard_story_review_link();

create or replace function private.sync_story_safety_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare media private.content_moderation_items; story_id integer; story_caption text;
begin
 if new.scope<>'story' or new.status is not distinct from old.status then return new;end if;
 if new.status='review' then
  -- Only the trusted moderation service can create private pending uploads.
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Safety service required' using errcode='42501';end if;
  select * into media from private.content_moderation_items where request_id=new.id and field_name='media_path' and kind in ('image','video') and storage_bucket='stories' limit 1;
  if media.id is null then return new;end if;
  if split_part(media.storage_path,'/',1)<>new.auth_id::text then raise exception 'Story upload ownership mismatch' using errcode='42501';end if;
  select preview into story_caption from private.content_moderation_items where request_id=new.id and field_name='caption' and kind='text' limit 1;
  insert into public.tbl_stories(user_id,media_url,media_type,caption,admin_moderation_status,admin_moderation_reason,moderation_request_id)
  values(new.user_id,media.storage_path,media.kind,coalesce(story_caption,''),'pending_review',coalesce(new.error_code,'Safety review required'),new.id)
  on conflict(moderation_request_id) do nothing;
 elsif new.status in ('approved','rejected') then
  if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
  update public.tbl_stories set admin_moderation_status=case when new.status='approved' then 'active' else 'rejected' end,
   admin_moderation_reason=new.review_reason,admin_moderated_at=now(),admin_moderated_by=auth.uid(),
   expires_at=case when new.status='approved' then now()+interval '24 hours' else expires_at end
  where moderation_request_id=new.id and admin_moderation_status='pending_review' and deleted_at is null returning id into story_id;
  if story_id is not null then
   insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
   values(auth.uid(),'story',story_id,case when new.status='approved' then 'approve_story' else 'reject_story' end,new.review_reason,
    jsonb_build_object('status','pending_review','request_id',new.id),jsonb_build_object('status',new.status,'request_id',new.id));
  end if;
 end if;
 return new;
end $$;
revoke all on function private.sync_story_safety_review() from public,anon,authenticated;
create trigger sync_story_safety_review after update of status on private.content_moderation_requests for each row execute function private.sync_story_safety_review();

-- Recover already-retained review uploads without publishing or re-uploading them.
do $$ declare prior_claims text:=current_setting('request.jwt.claims',true);begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.tbl_stories(user_id,media_url,media_type,caption,admin_moderation_status,admin_moderation_reason,moderation_request_id)
 select r.user_id,i.storage_path,i.kind,coalesce((select t.preview from private.content_moderation_items t where t.request_id=r.id and t.field_name='caption' and t.kind='text' limit 1),''),
  'pending_review',coalesce(r.error_code,'Safety review required'),r.id
 from private.content_moderation_requests r join private.content_moderation_items i on i.request_id=r.id
 where r.scope='story' and r.status='review' and i.field_name='media_path' and i.kind in ('image','video') and i.storage_bucket='stories'
  and split_part(i.storage_path,'/',1)=r.auth_id::text
  and exists(select 1 from storage.objects o where o.bucket_id='stories' and o.name=i.storage_path)
 on conflict(moderation_request_id) do nothing;
 perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
end $$;

-- A reviewed path must keep the exact bytes inspected by the safety service.
create policy story_bytes_immutable on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'stories') with check(bucket_id<>'stories');
create or replace function private.story_upload_path_unused(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_bucket<>'stories' or not exists(
  select 1 from private.content_moderation_items where storage_bucket='stories' and storage_path=p_path))
$$;
revoke all on function private.story_upload_path_unused(text,text) from public,anon;
grant execute on function private.story_upload_path_unused(text,text) to authenticated;
create policy story_paths_no_reuse on storage.objects as restrictive for insert to authenticated
 with check(private.story_upload_path_unused(bucket_id,name));

drop policy chat004_moderation_read on public.tbl_stories;
create policy chat004_moderation_read on public.tbl_stories as restrictive for select to authenticated
 using(admin_moderation_status='active' or (select public.is_wenitro_admin()) or user_id=(select public.current_app_user_id()));
notify pgrst,'reload schema';
