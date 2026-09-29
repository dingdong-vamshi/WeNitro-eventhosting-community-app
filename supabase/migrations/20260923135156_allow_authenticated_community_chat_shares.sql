-- Community chats are real chat destinations. Keep membership enforcement, but
-- allow authenticated members to deliver the same typed share cards used by
-- personal and group chats.
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
    if not exists(select 1 from public.tbl_chat_rooms r where r.id=target_room and r.room_type in ('personal','group','community')) then raise exception 'Shares can only be sent to chats'; end if;
    insert into public.tbl_messages(room_id,sender_id,content,message_type,client_id,is_delivered,share_payload)
    values(target_room,me,fallback_content,message_type,v_client_id,true,payload)
    on conflict(sender_id,client_id) where client_id is not null do update set client_id=excluded.client_id returning * into message_row;
    return next to_jsonb(message_row)||jsonb_build_object('sender',(select jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image) from public.tbl_users u where u.id=me));
  end loop;
end $$;

revoke all on function public.send_chat_share(integer[],uuid[],text,bigint) from public;
revoke execute on function public.send_chat_share(integer[],uuid[],text,bigint) from anon;
grant execute on function public.send_chat_share(integer[],uuid[],text,bigint) to authenticated;
