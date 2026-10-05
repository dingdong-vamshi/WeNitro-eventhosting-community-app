-- Server-side text and image moderation ledger. Public writes are accepted only
-- after a recent SAFE decision for the exact field value. Provider credentials
-- and full image bytes never enter public tables.
create table private.content_moderation_requests(
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.tbl_users(id) on delete cascade,
  auth_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check(scope in (
    'activity','community','community_post','activity_comment','community_comment','vibe_comment',
    'profile','partner','vibe','story','registration_question','poll'
  )),
  status text not null default 'pending' check(status in ('pending','safe','unsafe','review','approved','rejected')),
  model text,
  provider_request_id text,
  categories jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  error_code text,
  review_reason text,
  reviewer_auth_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  reviewed_at timestamptz
);

create table private.content_moderation_items(
  id bigint generated always as identity primary key,
  request_id uuid not null references private.content_moderation_requests(id) on delete cascade,
  field_name text not null,
  kind text not null check(kind in ('text','image')),
  value_hash text not null check(value_hash ~ '^[0-9a-f]{64}$'),
  content_hash text check(content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  preview text not null default '',
  storage_bucket text,
  storage_path text,
  status text not null default 'pending' check(status in ('pending','safe','unsafe','review','approved','rejected')),
  categories jsonb not null default '{}'::jsonb
);

create table private.content_moderation_cache(
  kind text not null check(kind='image'),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  status text not null check(status in ('safe','unsafe')),
  categories jsonb not null default '{}'::jsonb,
  model text not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '180 days',
  primary key(kind,content_hash)
);

alter table private.content_moderation_requests enable row level security;
alter table private.content_moderation_items enable row level security;
alter table private.content_moderation_cache enable row level security;
revoke all on private.content_moderation_requests,private.content_moderation_items,private.content_moderation_cache from public,anon,authenticated;

create index content_moderation_actor_recent on private.content_moderation_requests(auth_id,scope,created_at desc);
create index content_moderation_queue on private.content_moderation_requests(status,created_at desc) where status in ('pending','review');
create index content_moderation_item_lookup on private.content_moderation_items(field_name,value_hash,status,request_id);

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
 and ((p_kind='image' and p_field in ('cover_path','image_path','media_path','profile_image')) or
      (p_kind='text' and p_field not in ('cover_path','image_path','media_path','profile_image')))
$$;
revoke all on function private.moderation_allowed_field(text,text,text) from public,anon,authenticated;

create or replace function public.content_moderation_begin(p_auth_id uuid,p_scope text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer; request_id uuid; item jsonb; value text; kind text; field_name text;
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
 for item in select value from jsonb_array_elements(p_items) loop
   field_name:=item->>'field';kind:=item->>'kind';value:=coalesce(item->>'value','');
   content_hash:=nullif(lower(coalesce(item->>'contentHash','')),'');
   bucket:=nullif(item->>'storageBucket','');object_path:=nullif(item->>'storagePath','');
   if not private.moderation_allowed_field(p_scope,field_name,kind) then raise exception 'Invalid moderation field' using errcode='22023';end if;
   if length(value)>40000 then raise exception 'Moderation field is too long' using errcode='22023';end if;
   if kind='image' and (content_hash is null or content_hash!~'^[0-9a-f]{64}$' or bucket is null or object_path is null or length(object_path)>500) then
     raise exception 'Invalid image moderation item' using errcode='22023';
   end if;
   cached_status:=null;cached_categories:='{}'::jsonb;
   if kind='image' then
     select c.status,c.categories into cached_status,cached_categories from private.content_moderation_cache c
     where c.kind='image' and c.content_hash=content_hash and c.expires_at>now();
   end if;
   insert into private.content_moderation_items(request_id,field_name,kind,value_hash,content_hash,preview,storage_bucket,storage_path,status,categories)
   values(request_id,field_name,kind,encode(extensions.digest(normalize(value,NFKC),'sha256'),'hex'),content_hash,
     case when kind='text' then left(value,500) else '' end,bucket,object_path,coalesce(cached_status,'pending'),coalesce(cached_categories,'{}'::jsonb));
   if cached_status is null then uncached:=uncached+1;
   elsif kind='image' then cached_images:=cached_images||jsonb_build_array(jsonb_build_object('contentHash',content_hash,'status',cached_status,'categories',cached_categories));end if;
 end loop;
 return jsonb_build_object('requestId',request_id,'status','pending','uncachedItems',uncached,'cachedImages',cached_images);
exception when others then
 if request_id is not null then delete from private.content_moderation_requests where id=request_id;end if;
 raise;
end $$;

create or replace function public.content_moderation_resolve(
 p_auth_id uuid,p_request_id uuid,p_status text,p_model text,p_attempt_count integer,
 p_categories jsonb default '{}'::jsonb,p_provider_request_id text default null,p_error_code text default null,
 p_image_results jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row private.content_moderation_requests; image_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 if p_status not in ('safe','unsafe','review') or p_attempt_count<1 or p_attempt_count>5 then raise exception 'Invalid moderation result' using errcode='22023';end if;
 select * into request_row from private.content_moderation_requests where id=p_request_id and auth_id=p_auth_id for update;
 if request_row.id is null then raise exception 'Moderation request unavailable' using errcode='42501';end if;
 if request_row.status<>'pending' then return jsonb_build_object('requestId',request_row.id,'status',request_row.status);end if;
 update private.content_moderation_requests set status=p_status,model=left(p_model,100),attempt_count=p_attempt_count,
   categories=coalesce(p_categories,'{}'::jsonb),provider_request_id=left(p_provider_request_id,200),
   error_code=left(p_error_code,80),resolved_at=now() where id=p_request_id;
 update private.content_moderation_items set status=p_status,categories=coalesce(p_categories,'{}'::jsonb)
 where request_id=p_request_id and status='pending';
 if jsonb_typeof(p_image_results)='array' then
  for image_result in select value from jsonb_array_elements(p_image_results) loop
   if (image_result->>'contentHash')~'^[0-9a-f]{64}$' and (image_result->>'status') in ('safe','unsafe') then
    insert into private.content_moderation_cache(kind,content_hash,status,categories,model,updated_at,expires_at)
    values('image',image_result->>'contentHash',image_result->>'status',coalesce(image_result->'categories','{}'::jsonb),left(p_model,100),now(),now()+interval '180 days')
    on conflict(kind,content_hash) do update set status=excluded.status,categories=excluded.categories,model=excluded.model,updated_at=now(),expires_at=excluded.expires_at;
   end if;
  end loop;
 end if;
 return jsonb_build_object('requestId',p_request_id,'status',p_status);
end $$;

revoke all on function public.content_moderation_begin(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.content_moderation_resolve(uuid,uuid,text,text,integer,jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.content_moderation_begin(uuid,text,jsonb),public.content_moderation_resolve(uuid,uuid,text,text,integer,jsonb,text,text,jsonb) to service_role;

create or replace function private.moderation_array_text(p_value jsonb)
returns text language sql immutable set search_path='' as $$
 select case when p_value is null or p_value='null'::jsonb then ''
  when jsonb_typeof(p_value)='array' then coalesce((select string_agg(case when jsonb_typeof(x)='string' then x#>>'{}' else x::text end,E'\n' order by n) from jsonb_array_elements(p_value) with ordinality a(x,n)),'')
  else p_value#>>'{}' end
$$;

create or replace function private.require_safe_moderation(p_scope text,p_field text,p_value text,p_kind text default 'text')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'role','')='service_role' or btrim(coalesce(p_value,''))='' then return;end if;
 if not exists(
   select 1 from private.content_moderation_requests r join private.content_moderation_items i on i.request_id=r.id
   where r.auth_id=auth.uid() and r.scope=p_scope and r.status in ('safe','approved')
    and i.field_name=p_field and i.kind=p_kind and i.status in ('safe','approved')
    and i.value_hash=encode(extensions.digest(normalize(p_value,NFKC),'sha256'),'hex')
    and r.created_at>now()-interval '30 minutes'
 ) then raise exception 'Content must pass moderation before it can be published.' using errcode='42501';end if;
end $$;
revoke all on function private.require_safe_moderation(text,text,text,text) from public,anon,authenticated;

create or replace function private.guard_moderated_fields() returns trigger language plpgsql security definer set search_path='' as $$
declare scope text:=tg_argv[0]; field text; value text; previous text;
begin
 foreach field in array tg_argv[1:] loop
  value:=private.moderation_array_text(to_jsonb(new)->field);
  previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->field) else null end;
  if tg_op='UPDATE' and value is not distinct from previous then continue;end if;
  perform private.require_safe_moderation(scope,field,value,'text');
 end loop;
 return new;
end $$;
revoke all on function private.guard_moderated_fields() from public,anon,authenticated;

create or replace function private.guard_moderated_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare field text; value text; previous text; cover text; old_cover text; became_public boolean;
begin
 if new.status<>'published' or new.visibility_type<>'public' then return new;end if;
 became_public:=tg_op<>'UPDATE' or old.status is distinct from 'published' or old.visibility_type is distinct from 'public';
 foreach field in array array['title','description','location_instruction','display_location'] loop
  value:=coalesce(to_jsonb(new)->>field,'');previous:=case when tg_op='UPDATE' then coalesce(to_jsonb(old)->>field,'') else null end;
  if became_public or value is distinct from previous then perform private.require_safe_moderation('activity',field,value,'text');end if;
 end loop;
 cover:=coalesce(new.media->0->>'url','');old_cover:=case when tg_op='UPDATE' then coalesce(old.media->0->>'url','') else null end;
 if (became_public or cover is distinct from old_cover) and cover<>'' then perform private.require_safe_moderation('activity','cover_path',cover,'image');end if;
 return new;
end $$;

create or replace function private.guard_moderated_community() returns trigger language plpgsql security definer set search_path='' as $$
declare field text; value text; previous text; became_public boolean;
begin
 if new.room_type<>'community' or coalesce(new.visibility,'public')<>'public' then return new;end if;
 became_public:=tg_op<>'UPDATE' or old.room_type is distinct from 'community' or coalesce(old.visibility,'public') is distinct from 'public';
 foreach field in array array['title','tagline','description','tags','rules'] loop
  value:=private.moderation_array_text(to_jsonb(new)->field);previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->field) else null end;
  if became_public or value is distinct from previous then perform private.require_safe_moderation('community',field,value,'text');end if;
 end loop;
 foreach field in array array['image_url','cover_url'] loop
  value:=coalesce(to_jsonb(new)->>field,'');previous:=case when tg_op='UPDATE' then coalesce(to_jsonb(old)->>field,'') else null end;
  if (became_public or value is distinct from previous) and value<>'' then perform private.require_safe_moderation('community',case field when 'image_url' then 'image_path' else 'cover_path' end,value,'image');end if;
 end loop;
 return new;
end $$;

drop trigger if exists guard_openai_moderation on public.tbl_events;
create trigger guard_openai_moderation before insert or update on public.tbl_events for each row execute function private.guard_moderated_activity();
drop trigger if exists guard_openai_moderation on public.tbl_chat_rooms;
create trigger guard_openai_moderation before insert or update on public.tbl_chat_rooms for each row execute function private.guard_moderated_community();
drop trigger if exists guard_openai_moderation on public.tbl_community_posts;
create trigger guard_openai_moderation before insert or update on public.tbl_community_posts for each row execute function private.guard_moderated_fields('community_post','title','body','category');
drop trigger if exists guard_openai_moderation on public.tbl_community_post_comments;
create trigger guard_openai_moderation before insert or update on public.tbl_community_post_comments for each row execute function private.guard_moderated_fields('community_comment','body');
drop trigger if exists guard_openai_moderation on public.tbl_event_comments;
create trigger guard_openai_moderation before insert or update on public.tbl_event_comments for each row execute function private.guard_moderated_fields('activity_comment','body');
drop trigger if exists guard_openai_moderation on public.tbl_vibe_comments;
create trigger guard_openai_moderation before insert or update on public.tbl_vibe_comments for each row execute function private.guard_moderated_fields('vibe_comment','text');
drop trigger if exists guard_openai_moderation on public.tbl_users;
create trigger guard_openai_moderation before insert or update on public.tbl_users for each row execute function private.guard_moderated_fields('profile','bio','about','occupation');
drop trigger if exists guard_openai_moderation on public.tbl_partner_profiles;
create trigger guard_openai_moderation before insert or update on public.tbl_partner_profiles for each row execute function private.guard_moderated_fields('partner','business_name','description','city','activity_types','activity_location','age_category');
drop trigger if exists guard_openai_moderation on public.tbl_activity_registration_questions;
create trigger guard_openai_moderation before insert or update on public.tbl_activity_registration_questions for each row execute function private.guard_moderated_fields('registration_question','label','options');

create or replace function private.guard_moderated_media() returns trigger language plpgsql security definer set search_path='' as $$
declare scope text:=tg_argv[0]; caption_field text:=tg_argv[1]; value text; previous text; media text; old_media text;
begin
 if scope='vibe' and coalesce(to_jsonb(new)->>'visibility','public')<>'public' then return new;end if;
 value:=private.moderation_array_text(to_jsonb(new)->caption_field);previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->caption_field) else null end;
 if tg_op<>'UPDATE' or value is distinct from previous then perform private.require_safe_moderation(scope,caption_field,value,'text');end if;
 if scope='vibe' then
  value:=private.moderation_array_text(to_jsonb(new)->'hashtags');previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->'hashtags') else null end;
  if tg_op<>'UPDATE' or value is distinct from previous then perform private.require_safe_moderation(scope,'hashtags',value,'text');end if;
 end if;
 if coalesce(to_jsonb(new)->>'media_type','') in ('image','photo') then
  media:=coalesce(to_jsonb(new)->>'media_url','');old_media:=case when tg_op='UPDATE' then coalesce(to_jsonb(old)->>'media_url','') else null end;
  if (tg_op<>'UPDATE' or media is distinct from old_media) and media<>'' then perform private.require_safe_moderation(scope,'media_path',media,'image');end if;
 end if;
 return new;
end $$;

drop trigger if exists guard_openai_moderation on public.tbl_activity_vibes;
create trigger guard_openai_moderation before insert or update on public.tbl_activity_vibes for each row execute function private.guard_moderated_media('vibe','caption');
drop trigger if exists guard_openai_moderation on public.tbl_stories;
create trigger guard_openai_moderation before insert or update on public.tbl_stories for each row execute function private.guard_moderated_media('story','caption');

create or replace function private.guard_moderated_post_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.media_type,'')='image' and coalesce(new.media_url,'')<>'' and (tg_op<>'UPDATE' or new.media_url is distinct from old.media_url) then
  perform private.require_safe_moderation('community_post','media_path',new.media_url,'image');
 end if;return new;
end $$;
drop trigger if exists guard_openai_moderation_image on public.tbl_community_posts;
create trigger guard_openai_moderation_image before insert or update on public.tbl_community_posts for each row execute function private.guard_moderated_post_image();

create or replace function private.guard_moderated_profile_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.profile_image,'')<>'' and (tg_op<>'UPDATE' or new.profile_image is distinct from old.profile_image) then
  perform private.require_safe_moderation('profile','profile_image',new.profile_image,'image');
 end if;return new;
end $$;
drop trigger if exists guard_openai_moderation_image on public.tbl_users;
create trigger guard_openai_moderation_image before insert or update of profile_image on public.tbl_users for each row execute function private.guard_moderated_profile_image();

create or replace function public.admin_list_content_moderation()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 return(select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'scope',r.scope,'status',r.status,'created_at',r.created_at,'resolved_at',r.resolved_at,
  'error_code',r.error_code,'categories',r.categories,'user_id',r.user_id,'items',(
   select coalesce(jsonb_agg(jsonb_build_object('field',i.field_name,'kind',i.kind,'preview',i.preview,
    'storage_bucket',i.storage_bucket,'storage_path',i.storage_path,'status',i.status,'categories',i.categories) order by i.id),'[]'::jsonb)
   from private.content_moderation_items i where i.request_id=r.id)) order by r.created_at desc),'[]'::jsonb)
 from (select * from private.content_moderation_requests where status in ('pending','review') order by created_at desc limit 500) r);
end $$;

create or replace function public.admin_review_content_moderation(p_request_id uuid,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_status text;next_status text;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_decision not in ('approve','reject') or length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A valid decision and reason are required';end if;
 next_status:=case p_decision when 'approve' then 'approved' else 'rejected' end;
 select status into old_status from private.content_moderation_requests where id=p_request_id for update;
 if old_status is null then raise exception 'Moderation request unavailable';end if;
 if old_status not in ('pending','review') then return jsonb_build_object('id',p_request_id,'status',old_status,'changed',false);end if;
 update private.content_moderation_requests set status=next_status,review_reason=btrim(p_reason),reviewer_auth_id=auth.uid(),reviewed_at=now(),resolved_at=coalesce(resolved_at,now()) where id=p_request_id;
 update private.content_moderation_items set status=next_status where request_id=p_request_id and status in ('pending','review');
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
 values(auth.uid(),'content_moderation',0,'moderation_'||p_decision,btrim(p_reason),jsonb_build_object('request_id',p_request_id,'status',old_status),jsonb_build_object('request_id',p_request_id,'status',next_status));
 return jsonb_build_object('id',p_request_id,'status',next_status,'changed',true);
end $$;
revoke all on function public.admin_list_content_moderation(),public.admin_review_content_moderation(uuid,text,text) from public,anon;
grant execute on function public.admin_list_content_moderation(),public.admin_review_content_moderation(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
