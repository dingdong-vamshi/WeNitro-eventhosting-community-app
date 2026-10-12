-- CHAT 004: qualify the image-cache variable, enforce Activity-linked media,
-- and keep videos private until an Admin reviews the exact uploaded bytes.
alter table private.content_moderation_items drop constraint content_moderation_items_kind_check;
alter table private.content_moderation_items add constraint content_moderation_items_kind_check check(kind in ('text','image','video'));
-- Recheck earlier SAFE image cache entries under the tightened policy.
update private.content_moderation_cache set expires_at=now() where status='safe' and expires_at>now();
create or replace function private.moderation_allowed_field(p_scope text,p_field text,p_kind text)
returns boolean language sql immutable set search_path='' as $$
 select case p_scope
  when 'activity' then p_field in ('title','description','location_instruction','display_location','cover_path')
  when 'community' then p_field in ('title','tagline','description','tags','rules','image_path','cover_path')
  when 'community_post' then p_field in ('title','body','category','media_path')
  when 'activity_comment' then p_field='body'
  when 'community_comment' then p_field='body'
  when 'vibe_comment' then p_field='text'
  when 'profile' then p_field in ('bio','about','occupation','profile_image')
  when 'partner' then p_field in ('business_name','description','city','activity_types','activity_location','age_category')
  when 'vibe' then p_field in ('caption','hashtags','media_path')
  when 'story' then p_field in ('caption','media_path')
  when 'registration_question' then p_field in ('label','options')
  when 'poll' then p_field in ('question','options')
  else false end
 and ((p_kind in ('image','video') and p_field in ('cover_path','image_path','media_path','profile_image')) or
      (p_kind='text' and p_field not in ('cover_path','image_path','media_path','profile_image')))
$$;
revoke all on function private.moderation_allowed_field(text,text,text) from public,anon,authenticated;

-- Repair an ambiguous PL/pgSQL identifier discovered by the deployed production smoke test.
create or replace function public.content_moderation_begin(p_auth_id uuid,p_scope text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<moderation_session>>
declare me integer; request_id uuid; item jsonb; raw_value text; kind text; field_name text;
  content_hash text; bucket text; object_path text; cached_status text; cached_categories jsonb;
  total integer; uncached integer:=0; cached_images jsonb:='[]'::jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 select u.id into me from public.tbl_users u join auth.users a on a.id=u.auth_user_id
 where a.id=p_auth_id and u.is_active=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null
  and (a.banned_until is null or a.banned_until<=now()) limit 1;
 if me is null then raise exception 'Account unavailable' using errcode='42501';end if;
 if p_scope is null or not private.moderation_allowed_field(p_scope,
   case p_scope when 'activity' then 'title' when 'community' then 'title' when 'community_post' then 'title'
   when 'activity_comment' then 'body' when 'community_comment' then 'body' when 'profile' then 'bio'
   when 'vibe_comment' then 'text' when 'partner' then 'business_name' when 'vibe' then 'caption' when 'story' then 'caption'
   when 'registration_question' then 'label' else 'question' end,'text') then
   raise exception 'Invalid moderation scope' using errcode='22023';
 end if;
 if jsonb_typeof(p_items)<>'array' then raise exception 'Moderation items must be an array' using errcode='22023';end if;
 total:=jsonb_array_length(p_items);
 if total<1 or total>40 then raise exception 'Moderation requires 1 to 40 fields' using errcode='22023';end if;
 if (select count(*) from private.content_moderation_requests where auth_id=p_auth_id and created_at>now()-interval '1 minute')>=20 then
   raise exception 'Please wait before submitting more content' using errcode='P0001';
 end if;
 insert into private.content_moderation_requests(user_id,auth_id,scope) values(me,p_auth_id,p_scope) returning id into request_id;
 for item in select element from jsonb_array_elements(p_items) as items(element) loop
   field_name:=item->>'field';kind:=item->>'kind';raw_value:=coalesce(item->>'value','');
   content_hash:=nullif(lower(coalesce(item->>'contentHash','')),'');
   bucket:=nullif(item->>'storageBucket','');object_path:=nullif(item->>'storagePath','');
   if not private.moderation_allowed_field(p_scope,field_name,kind) then raise exception 'Invalid moderation field' using errcode='22023';end if;
   if length(raw_value)>40000 then raise exception 'Moderation field is too long' using errcode='22023';end if;
   if kind in ('image','video') and (content_hash is null or content_hash!~'^[0-9a-f]{64}$' or bucket is null or object_path is null or length(object_path)>500) then
     raise exception 'Invalid image moderation item' using errcode='22023';
   end if;
   cached_status:=null;cached_categories:='{}'::jsonb;
   if kind='image' then
     select c.status,c.categories into cached_status,cached_categories from private.content_moderation_cache c
     where c.kind='image' and c.content_hash=moderation_session.content_hash and c.expires_at>now();
   end if;
   if kind in ('image','video') and cached_status is null then
     -- Only an Admin's review of these exact server-hashed bytes authorizes media reuse.
     select 'safe',i.categories into cached_status,cached_categories
     from private.content_moderation_items i join private.content_moderation_requests r on r.id=i.request_id
     where i.kind=moderation_session.kind and i.content_hash=moderation_session.content_hash
       and i.field_name=moderation_session.field_name and r.auth_id=p_auth_id and r.scope=p_scope
       and r.status='approved' and i.status='approved' and r.reviewed_at>now()-interval '30 days'
     order by r.reviewed_at desc limit 1;
   end if;
   insert into private.content_moderation_items(request_id,field_name,kind,value_hash,content_hash,preview,storage_bucket,storage_path,status,categories)
   values(request_id,field_name,kind,encode(extensions.digest(normalize(raw_value,NFKC),'sha256'),'hex'),content_hash,
     case when kind='text' then left(raw_value,500) else '' end,bucket,object_path,coalesce(cached_status,'pending'),coalesce(cached_categories,'{}'::jsonb));
   if cached_status is null then uncached:=uncached+1;
   elsif kind in ('image','video') then cached_images:=cached_images||jsonb_build_array(jsonb_build_object('contentHash',content_hash,'status',cached_status,'categories',cached_categories));end if;
 end loop;
 return jsonb_build_object('requestId',request_id,'status','pending','uncachedItems',uncached,'cachedImages',cached_images);
exception when others then
 if request_id is not null then delete from private.content_moderation_requests where id=request_id;end if;
 raise;
end $$;

create or replace function private.guard_moderated_media() returns trigger language plpgsql security definer set search_path='' as $$
declare scope text:=tg_argv[0]; caption_field text:=tg_argv[1]; value text; previous text; media text; old_media text;
begin
 value:=private.moderation_array_text(to_jsonb(new)->caption_field);previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->caption_field) else null end;
 if tg_op<>'UPDATE' or value is distinct from previous then perform private.require_safe_moderation(scope,caption_field,value,'text');end if;
 if scope='vibe' then
  value:=private.moderation_array_text(to_jsonb(new)->'hashtags');previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->'hashtags') else null end;
  if tg_op<>'UPDATE' or value is distinct from previous then perform private.require_safe_moderation(scope,'hashtags',value,'text');end if;
 end if;
 if coalesce(to_jsonb(new)->>'media_type','') in ('image','photo','video') then
  media:=coalesce(to_jsonb(new)->>'media_url','');old_media:=case when tg_op='UPDATE' then coalesce(to_jsonb(old)->>'media_url','') else null end;
  if (tg_op<>'UPDATE' or media is distinct from old_media) and media<>'' then perform private.require_safe_moderation(scope,'media_path',media,case when to_jsonb(new)->>'media_type'='video' then 'video' else 'image' end);end if;
 end if;
 return new;
end $$;

create or replace function private.guard_moderated_post_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.media_type,'') in ('image','video') and coalesce(new.media_url,'')<>'' and (tg_op<>'UPDATE' or new.media_url is distinct from old.media_url) then
  perform private.require_safe_moderation('community_post','media_path',new.media_url,case when new.media_type='video' then 'video' else 'image' end);
 end if;return new;
end $$;
notify pgrst,'reload schema';
