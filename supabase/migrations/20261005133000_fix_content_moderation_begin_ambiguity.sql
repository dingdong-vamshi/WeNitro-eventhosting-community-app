-- Repair an ambiguous PL/pgSQL identifier discovered by the deployed production smoke test.
create or replace function public.content_moderation_begin(p_auth_id uuid,p_scope text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
   if kind='image' and (content_hash is null or content_hash!~'^[0-9a-f]{64}$' or bucket is null or object_path is null or length(object_path)>500) then
     raise exception 'Invalid image moderation item' using errcode='22023';
   end if;
   cached_status:=null;cached_categories:='{}'::jsonb;
   if kind='image' then
     select c.status,c.categories into cached_status,cached_categories from private.content_moderation_cache c
     where c.kind='image' and c.content_hash=content_hash and c.expires_at>now();
   end if;
   insert into private.content_moderation_items(request_id,field_name,kind,value_hash,content_hash,preview,storage_bucket,storage_path,status,categories)
   values(request_id,field_name,kind,encode(extensions.digest(normalize(raw_value,NFKC),'sha256'),'hex'),content_hash,
     case when kind='text' then left(raw_value,500) else '' end,bucket,object_path,coalesce(cached_status,'pending'),coalesce(cached_categories,'{}'::jsonb));
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
grant execute on function public.content_moderation_begin(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
