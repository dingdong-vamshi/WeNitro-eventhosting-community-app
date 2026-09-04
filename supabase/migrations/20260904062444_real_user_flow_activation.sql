-- Applied to project klyjzbisgycegkkacbjw through the connected Supabase plugin.

create or replace function private.sync_auth_profile_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.tbl_users
  set is_active = case
    when new.email_confirmed_at is not null or new.phone_confirmed_at is not null then 1
    else 0
  end
  where auth_user_id = new.id and coalesce(is_delete, 0) = 0;
  return new;
end $$;

notify pgrst, 'reload schema';

revoke all on function private.sync_auth_profile_activation() from public;
drop trigger if exists zz_on_auth_user_confirmation_wenitro on auth.users;
create trigger zz_on_auth_user_confirmation_wenitro
after insert or update of email_confirmed_at, phone_confirmed_at on auth.users
for each row execute function private.sync_auth_profile_activation();

update public.tbl_users profile set is_active = 0
from auth.users auth_user
where profile.auth_user_id = auth_user.id
  and coalesce(profile.is_delete, 0) = 0
  and auth_user.email is not null
  and auth_user.email_confirmed_at is null
  and auth_user.phone_confirmed_at is null;

drop policy if exists app_profiles_read on public.tbl_users;
create policy app_profiles_read on public.tbl_users for select to authenticated
using (coalesce(is_delete, 0) = 0 and coalesce(is_active, 0) = 1 and private.can_read_profile(id));

create or replace function public.list_discoverable_people(p_limit integer default 50)
returns setof jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'fullname', profile.fullname,
    'bio', profile.bio,
    'profile_image', profile.profile_image,
    'rating', profile.rating
  )
  from public.tbl_users profile
  where profile.id <> public.get_current_app_user_id()
    and coalesce(profile.is_delete, 0) = 0
    and coalesce(profile.is_active, 0) = 1
    and profile.auth_user_id is not null
    and private.can_read_profile(profile.id)
  order by profile.fullname, profile.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
revoke all on function public.list_discoverable_people(integer) from public;
revoke execute on function public.list_discoverable_people(integer) from anon;
grant execute on function public.list_discoverable_people(integer) to authenticated;

create or replace function public.create_direct_chat_room(p_other_user_id integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare me integer := public.get_current_app_user_id(); rid integer;
begin
  if p_other_user_id = me or not exists (
    select 1 from public.tbl_users where id = p_other_user_id
      and coalesce(is_delete, 0) = 0 and coalesce(is_active, 0) = 1
      and auth_user_id is not null
  ) then raise exception 'Invalid participant'; end if;
  select r.id into rid from public.tbl_chat_rooms r
  where r.room_type = 'personal'
    and exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=me)
    and exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=p_other_user_id)
    and (select count(*) from public.tbl_chat_participants p where p.room_id=r.id)=2
  order by r.id limit 1;
  if rid is null then
    insert into public.tbl_chat_rooms(room_type,created_by) values('personal',me) returning id into rid;
    insert into public.tbl_chat_participants(room_id,user_id,role)
    values(rid,me,'admin'),(rid,p_other_user_id,'member') on conflict(room_id,user_id) do nothing;
  end if;
  return rid;
end $$;

alter table public.tbl_messages add column if not exists share_payload jsonb;
do $$ declare constraint_row record; begin
  for constraint_row in select conname from pg_constraint
    where conrelid='public.tbl_messages'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%message_type%'
  loop execute format('alter table public.tbl_messages drop constraint %I',constraint_row.conname); end loop;
end $$;
alter table public.tbl_messages add constraint tbl_messages_message_type_check
check (message_type in ('text','image','video','poll','audio','document','activity_share','community_share','community_post_share','vibe_share'));
alter table public.tbl_messages drop constraint if exists tbl_messages_share_payload_check;
alter table public.tbl_messages add constraint tbl_messages_share_payload_check
check (message_type not in ('activity_share','community_share','community_post_share','vibe_share') or
  (jsonb_typeof(share_payload)='object' and share_payload?'version' and share_payload?'kind'
   and share_payload?'entity_id' and share_payload?'title' and share_payload?'deep_link' and share_payload?'shared_by'));

create or replace function public.send_chat_share(
  p_room_ids integer[], p_client_ids uuid[], p_share_kind text, p_entity_id bigint
) returns setof jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me integer:=public.get_current_app_user_id(); room_count integer:=coalesce(cardinality(p_room_ids),0);
  target_room integer; v_client_id uuid; message_row public.tbl_messages; entity_title text;
  entity_preview text; parent_id bigint; deep_link text; thumbnail_bucket text;
  thumbnail_path text; message_type text; fallback_content text; payload jsonb; i integer;
begin
  if p_share_kind not in ('activity','community','community_post','vibe') then raise exception 'Invalid share type'; end if;
  if p_entity_id is null or p_entity_id<=0 then raise exception 'Invalid shared item'; end if;
  if room_count<1 or room_count>20 or cardinality(p_client_ids)<>room_count then raise exception 'Select between 1 and 20 conversations'; end if;
  if (select count(distinct value) from unnest(p_room_ids) value)<>room_count then raise exception 'Duplicate conversations are not allowed'; end if;
  if p_share_kind='activity' then
    select e.title,left(coalesce(nullif(btrim(e.description),''),e.display_location,''),240),null::bigint,
      '#/activity/'||e.id::text,'activity-media',coalesce(e.media#>>'{wenitro,cover_url}',e.media#>>'{_wenitro,cover_url}',e.media->>'cover_url',e.media->>'path')
    into entity_title,entity_preview,parent_id,deep_link,thumbnail_bucket,thumbnail_path
    from public.tbl_events e where e.id=p_entity_id and not coalesce(e.is_deleted,false)
      and (e.visibility_type='public' or e.created_by=me or public.is_event_participant(e.id));
  elsif p_share_kind='community' then
    select r.title,left(coalesce(nullif(btrim(r.description),''),nullif(btrim(r.tagline),''),''),240),null::bigint,
      '#/community/'||r.id::text,'communities',coalesce(r.cover_url,r.image_url)
    into entity_title,entity_preview,parent_id,deep_link,thumbnail_bucket,thumbnail_path
    from public.tbl_chat_rooms r where r.id=p_entity_id and r.room_type='community'
      and (r.created_by=me or public.is_chat_member(r.id) or (coalesce(r.visibility,'public')='public' and coalesce(r.join_type,'direct')<>'approval'));
  elsif p_share_kind='community_post' then
    select coalesce(nullif(btrim(p.title),''),'Community post'),left(p.body,240),p.room_id,
      '#/community/'||p.room_id::text||'/post/'||p.id::text,'communities',p.media_url
    into entity_title,entity_preview,parent_id,deep_link,thumbnail_bucket,thumbnail_path
    from public.tbl_community_posts p where p.id=p_entity_id and p.deleted_at is null
      and (p.user_id=me or public.is_chat_member(p.room_id));
  else
    select coalesce(nullif(btrim(v.caption),''),'WeNitro Vibe'),left(coalesce(nullif(btrim(v.caption),''),'Shared a WeNitro Vibe'),240),v.event_id,
      '#/vibe/'||v.id::text,'vibes',coalesce(v.thumbnail_url,v.media_url)
    into entity_title,entity_preview,parent_id,deep_link,thumbnail_bucket,thumbnail_path
    from public.tbl_activity_vibes v where v.id=p_entity_id
      and (coalesce(v.visibility,'public')='public' or v.user_id=me or (v.event_id is not null and public.is_event_participant(v.event_id::integer)));
  end if;
  if entity_title is null then raise exception 'Shared item is unavailable'; end if;
  message_type:=p_share_kind||'_share';
  fallback_content:='Shared '||case p_share_kind when 'activity' then 'an activity' when 'community' then 'a community' when 'community_post' then 'a community post' else 'a vibe' end||': '||entity_title;
  payload:=jsonb_strip_nulls(jsonb_build_object('version',1,'kind',p_share_kind,'entity_id',p_entity_id::text,
    'parent_id',case when parent_id is null then null else parent_id::text end,'title',entity_title,'preview',entity_preview,
    'thumbnail_bucket',thumbnail_bucket,'thumbnail_path',thumbnail_path,'deep_link',deep_link,'shared_by',me));
  for i in 1..room_count loop
    target_room:=p_room_ids[i]; v_client_id:=p_client_ids[i];
    if target_room is null or v_client_id is null then raise exception 'Invalid conversation selection'; end if;
    perform public.assert_chat_membership(target_room);
    if not exists(select 1 from public.tbl_chat_rooms r where r.id=target_room and r.room_type in ('personal','group')) then raise exception 'Shares can only be sent to chats'; end if;
    insert into public.tbl_messages(room_id,sender_id,content,message_type,client_id,is_delivered,share_payload)
    values(target_room,me,fallback_content,message_type,v_client_id,true,payload)
    on conflict(sender_id,client_id) where client_id is not null do update set client_id=excluded.client_id returning * into message_row;
    return next to_jsonb(message_row)||jsonb_build_object('sender',(select jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image) from public.tbl_users u where u.id=me));
  end loop;
end $$;
revoke all on function public.send_chat_share(integer[],uuid[],text,bigint) from public;
revoke execute on function public.send_chat_share(integer[],uuid[],text,bigint) from anon;
grant execute on function public.send_chat_share(integer[],uuid[],text,bigint) to authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['tbl_events','tbl_event_participants','tbl_event_feedback','tbl_event_likes','tbl_event_saves','tbl_chat_rooms','tbl_community_posts','tbl_community_post_comments','tbl_community_post_reactions','tbl_activity_vibes','tbl_stories'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('alter table public.%I replica identity full',table_name);
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name)
      then execute format('alter publication supabase_realtime add table public.%I',table_name); end if;
    end if;
  end loop;
end $$;
