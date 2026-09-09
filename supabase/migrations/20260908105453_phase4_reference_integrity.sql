CREATE OR REPLACE FUNCTION public.create_direct_chat_room(p_other_user_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me integer := public.get_current_app_user_id();
  rid integer;
begin
  if not private.may_message(p_other_user_id) then raise exception 'This member is not accepting messages from you' using errcode='42501'; end if;
  if p_other_user_id = me
     or not exists (
       select 1
       from public.tbl_users
       where id = p_other_user_id
         and coalesce(is_delete, 0) = 0
         and coalesce(is_active, 0) = 1
         and auth_user_id is not null
     ) then
    raise exception 'Invalid participant';
  end if;

  select r.id
  into rid
  from public.tbl_chat_rooms r
  where r.room_type = 'personal'
    and exists (
      select 1 from public.tbl_chat_participants p
      where p.room_id = r.id and p.user_id = me
    )
    and exists (
      select 1 from public.tbl_chat_participants p
      where p.room_id = r.id and p.user_id = p_other_user_id
    )
    and (
      select count(*) from public.tbl_chat_participants p where p.room_id = r.id
    ) = 2
  order by r.id
  limit 1;

  if rid is null then
    insert into public.tbl_chat_rooms(room_type, created_by)
    values ('personal', me)
    returning id into rid;

    insert into public.tbl_chat_participants(room_id, user_id, role)
    values (rid, me, 'admin'), (rid, p_other_user_id, 'member')
    on conflict(room_id, user_id) do nothing;
  end if;

  return rid;
end
$function$;

-- Link only unambiguous pre-existing poll messages to their existing poll records.
update public.tbl_messages m set poll_id=p.id from public.tbl_chat_polls p where m.poll_id is null and m.message_type='poll' and m.room_id=p.room_id and m.sender_id=p.created_by and m.content=p.question and (select count(*) from public.tbl_chat_polls other where other.room_id=m.room_id and other.created_by=m.sender_id and other.question=m.content)=1 and (select count(*) from public.tbl_messages other where other.room_id=p.room_id and other.sender_id=p.created_by and other.content=p.question and other.message_type='poll')=1;
CREATE OR REPLACE FUNCTION public.community_create(p_name text, p_tagline text, p_description text, p_category text, p_tags text[], p_rules text[], p_image_path text, p_cover_path text, p_visibility text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me integer:=public.get_current_app_user_id(); rid integer; cid integer;
begin
 if length(trim(p_name)) not between 3 and 100 then raise exception 'Invalid community name'; end if; if p_visibility not in ('public','private') then raise exception 'Invalid visibility'; end if;
 if nullif(trim(p_category),'') is not null then select id into cid from public.tbl_categories where lower(trim(name))=lower(trim(p_category)) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(trim(p_category)) returning id into cid; end if; end if;
 insert into public.tbl_chat_rooms(room_type,created_by,title,tagline,description,category_id,tags,rules,image_url,cover_url,visibility,join_type) values('community',me,trim(p_name),nullif(trim(p_tagline),''),coalesce(trim(p_description),''),cid,coalesce(p_tags,'{}'),coalesce(p_rules,'{}'),nullif(p_image_path,''),nullif(p_cover_path,''),p_visibility,case when p_visibility='private' then 'approval' else 'direct' end) returning id into rid;
 insert into public.tbl_chat_participants(room_id,user_id,role) values(rid,me,'admin'); return rid;
end $function$;
