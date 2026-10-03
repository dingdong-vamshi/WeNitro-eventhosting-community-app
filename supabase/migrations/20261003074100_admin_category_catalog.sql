-- Shared category catalog. Archiving preserves every historical relationship.
alter table public.tbl_categories
 add column if not exists icon text not null default '',
 add column if not exists description text not null default '',
 add column if not exists display_order integer not null default 100,
 add column if not exists is_enabled boolean not null default true,
 add column if not exists archived_at timestamptz;
update public.tbl_categories set name=btrim(name) where name<>btrim(name);
create unique index if not exists tbl_categories_normalized_name on public.tbl_categories(lower(btrim(name)));
alter table public.tbl_categories add constraint category_catalog_fields check(length(btrim(name)) between 2 and 80 and length(icon)<=32 and length(description)<=500 and display_order between 0 and 10000);
revoke insert,update,delete on public.tbl_categories from anon,authenticated;

create function private.save_admin_category(p_id integer,p_name text,p_icon text,p_description text,p_order integer,p_enabled boolean,p_archived boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row public.tbl_categories%rowtype; category_id integer;
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 if p_name is null or p_order is null or p_enabled is null or p_archived is null then raise exception 'Category fields are required';end if;
 perform pg_advisory_xact_lock(9030271);
 if p_id is not null then
  select to_jsonb(c) into before_row from public.tbl_categories c where id=p_id for update;
  if before_row is null then raise exception 'Category unavailable';end if;
  update public.tbl_categories set name=btrim(p_name),icon=coalesce(p_icon,''),description=coalesce(p_description,''),display_order=p_order,is_enabled=p_enabled,
    archived_at=case when p_archived then coalesce(archived_at,now()) else null end
    where id=p_id returning * into after_row;
 else
  if p_archived then raise exception 'New category cannot be archived';end if;
  insert into public.tbl_categories(name,icon,description,display_order,is_enabled)
  values(btrim(p_name),coalesce(p_icon,''),coalesce(p_description,''),p_order,p_enabled) returning * into after_row;
 end if;
 if before_row is distinct from to_jsonb(after_row) then
  insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
  values(auth.uid(),'category',after_row.id,case when p_archived then 'archive_category' else 'save_category' end,btrim(p_reason),coalesce(before_row,'{}'),to_jsonb(after_row));
 end if;
 return to_jsonb(after_row);
end $$;
create function public.admin_save_category(p_id integer,p_name text,p_icon text,p_description text,p_order integer,p_enabled boolean,p_archived boolean,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$ select private.save_admin_category(p_id,p_name,p_icon,p_description,p_order,p_enabled,p_archived,p_reason) $$;
revoke all on function private.save_admin_category(integer,text,text,text,integer,boolean,boolean,text),public.admin_save_category(integer,text,text,text,integer,boolean,boolean,text) from public,anon;
grant execute on function private.save_admin_category(integer,text,text,text,integer,boolean,boolean,text),public.admin_save_category(integer,text,text,text,integer,boolean,boolean,text) to authenticated;
grant usage on schema private to authenticated;

-- Existing rows continue to resolve archived names. New assignments must use an enabled category.
create function private.require_enabled_category() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.category_id is not distinct from old.category_id then return new;end if;
 if new.category_id is not null and not exists(select 1 from public.tbl_categories where id=new.category_id and is_enabled and archived_at is null) then
  raise exception 'Choose an available category' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function private.require_enabled_category() from public,anon,authenticated;
create trigger enabled_activity_category before insert or update of category_id on public.tbl_event_categories for each row execute function private.require_enabled_category();
create trigger enabled_community_category before insert or update of category_id on public.tbl_chat_rooms for each row execute function private.require_enabled_category();
create trigger enabled_interest_category before insert or update of category_id on public.tbl_user_interests for each row execute function private.require_enabled_category();

create function private.guard_category_creation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.is_wenitro_admin() then raise exception 'Category management requires an administrator' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guard_category_creation() from public,anon,authenticated;
create trigger category_creation_guard before insert on public.tbl_categories for each row execute function private.guard_category_creation();

-- Preserve unchanged historical categories during unrelated edits.
CREATE OR REPLACE FUNCTION public.update_activity(p_event_id integer, p_patch jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me integer:=public.get_current_app_user_id(); cat text:=nullif(trim(p_patch->>'category'),''); cid integer; cover text:=nullif(trim(p_patch->>'cover_url'),'');
begin
  perform private.assert_activity_mutable(p_event_id);
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Activity patch must be an object' using errcode='22023'; end if;
  if not private.can_manage_activity(p_event_id,me) then raise exception 'Activity not found or not manageable' using errcode='42501'; end if;
  update public.tbl_events set
    title=case when p_patch?'title' then trim(p_patch->>'title') else title end,
    description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,
    event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,
    event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,
    registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,
    max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,
    visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,
    join_type=case when p_patch?'join_type' then p_patch->>'join_type' else join_type end,
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
    verified_only=case when p_patch?'verified_only' then (p_patch->>'verified_only')::boolean else verified_only end,
    age_min=case when p_patch?'age_min' then nullif(p_patch->>'age_min','')::integer else age_min end,
    age_max=case when p_patch?'age_max' then nullif(p_patch->>'age_max','')::integer else age_max end,
    gender_preference=case when p_patch?'gender_preference' then nullif(p_patch->>'gender_preference','') else gender_preference end,
    location_instruction=case when p_patch?'location_instruction' then nullif(trim(p_patch->>'location_instruction'),'') else location_instruction end,
    costs_may_apply=case when p_patch?'costs_may_apply' then (p_patch->>'costs_may_apply')::boolean else costs_may_apply end,
    entry_fee_required=case when p_patch?'entry_fee_required' then (p_patch->>'entry_fee_required')::boolean else entry_fee_required end,
    updated_by=me,updated_at=now()
  where id=p_event_id;
  if cat is not null then
    select id into cid from public.tbl_categories where lower(trim(name))=lower(cat) order by id limit 1;
    if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if;
    if not exists(select 1 from public.tbl_event_categories where event_id=p_event_id and category_id=cid) then
      delete from public.tbl_event_categories where event_id=p_event_id;
      insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me);
    end if;
  end if;
  if p_patch?'registration_questions' then perform private.save_activity_registration_questions(p_event_id,p_patch->'registration_questions'); end if;
  return p_event_id;
end
$function$;

create or replace function public.list_interest_catalog() returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'slug',lower(regexp_replace(trim(c.name),'[^A-Za-z0-9]+','-','g')),'name',c.name,'icon',nullif(c.icon,''))
 from public.tbl_categories c where c.is_enabled and c.archived_at is null and c.name !~* '^\[QA\]' order by c.display_order,c.name,c.id
$$;
revoke all on function public.list_interest_catalog() from public,anon;
grant execute on function public.list_interest_catalog() to authenticated;
