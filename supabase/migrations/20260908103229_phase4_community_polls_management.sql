-- Extend the existing community/chat model; no replacement membership or poll tables.
alter table public.tbl_chat_polls add column if not exists client_id uuid;
create unique index if not exists community_poll_client_unique on public.tbl_chat_polls(created_by,client_id) where client_id is not null;
alter table public.tbl_messages add column if not exists poll_id integer references public.tbl_chat_polls(id) on delete cascade;
create unique index if not exists community_poll_message_unique on public.tbl_messages(poll_id) where poll_id is not null;
create index if not exists chat_polls_room_created on public.tbl_chat_polls(room_id,created_at desc);
create index if not exists chat_poll_options_poll on public.tbl_chat_poll_options(poll_id);

create or replace function private.community_manager(rid integer) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tbl_chat_rooms r where r.id=rid and r.room_type='community' and (r.created_by=public.current_app_user_id() or exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=public.current_app_user_id() and p.role in ('admin','creator'))));
$$;
create or replace function private.community_can_post(rid integer) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_chat_member(rid) and exists(select 1 from public.tbl_chat_rooms r where r.id=rid and (r.room_type<>'community' or coalesce(r.post_permission,'all')='all' or r.created_by=public.current_app_user_id() or (r.post_permission='admins_only' and private.community_manager(rid))));
$$;
create or replace function private.guard_community_posting() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if auth.uid() is null then return new; end if;
 if not private.community_can_post(new.room_id) then raise exception 'Only community admins can post' using errcode='42501'; end if;
 return new;
 end;
$$;
create trigger guard_community_messages before insert or update of content,media_url,room_id,sender_id,poll_id on public.tbl_messages for each row execute function private.guard_community_posting();
create trigger guard_community_posts before insert or update of body,title,media_url,room_id,user_id on public.tbl_community_posts for each row execute function private.guard_community_posting();
create or replace function public.community_join(p_room_id integer) returns jsonb language plpgsql security definer set search_path='' as $$
 declare me integer:=public.get_current_app_user_id(); r public.tbl_chat_rooms;
 begin
 select * into r from public.tbl_chat_rooms where id=p_room_id and room_type='community' for update;
 if not found then raise exception 'Community not found'; end if;
 if exists(select 1 from public.tbl_chat_participants where room_id=p_room_id and user_id=me) then return jsonb_build_object('room_id',p_room_id,'status','active'); end if;
 if r.verification_level='verified_only' and not exists(select 1 from public.tbl_users where id=me and isverified=1) then raise exception 'This community is for verified members only' using errcode='42501'; end if;
 if r.join_type='direct' then
 insert into public.tbl_chat_participants(room_id,user_id,role) values(p_room_id,me,'member') on conflict(room_id,user_id) do nothing;
 delete from public.tbl_community_join_requests where room_id=p_room_id and user_id=me;
 return jsonb_build_object('room_id',p_room_id,'role','member','status','active');
 end if;
 insert into public.tbl_community_join_requests(room_id,user_id,status) values(p_room_id,me,'pending') on conflict(room_id,user_id) do update set status='pending';
 return jsonb_build_object('room_id',p_room_id,'role','member','status','pending');
 end;
$$;
-- A join approval must not make a public community disappear from discovery.
alter policy chat_rooms_read on public.tbl_chat_rooms using ((room_type='community' and coalesce(visibility,'public')='public') or created_by=public.current_app_user_id() or public.is_chat_member(id));
drop policy community_requests_scope on public.tbl_community_join_requests;
create policy community_requests_scope on public.tbl_community_join_requests for select to authenticated using(user_id=public.current_app_user_id() or private.community_manager(room_id));

create or replace function private.community_manage(p_room_id integer,p_action text,p_patch jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare me integer:=public.get_current_app_user_id(); r public.tbl_chat_rooms; cid integer; target integer;
 begin
 if not private.community_manager(p_room_id) then raise exception 'Community admin permission required' using errcode='42501'; end if;
 select * into r from public.tbl_chat_rooms where id=p_room_id for update;
 if p_action='edit' then
 if length(trim(p_patch->>'name')) not between 3 and 100 or length(trim(p_patch->>'description')) not between 10 and 500 then raise exception 'Check community name and description'; end if;
 select id into cid from public.tbl_categories where lower(trim(name))=lower(trim(p_patch->>'category')) order by id limit 1;
 if cid is null then raise exception 'Select an existing category'; end if;
 if p_patch?'image_path' and nullif(p_patch->>'image_path','') is not null and not (p_patch->>'image_path' like auth.uid()::text||'/%') then raise exception 'Invalid avatar path' using errcode='42501'; end if;
 update public.tbl_chat_rooms set title=trim(p_patch->>'name'),description=trim(p_patch->>'description'),category_id=cid,image_url=case when p_patch?'image_path' then nullif(p_patch->>'image_path','') else image_url end,updated_at=now() where id=p_room_id;
 elsif p_action='preferences' then
 update public.tbl_chat_rooms set verification_level=case when p_patch?'verified_only' then case when (p_patch->>'verified_only')::boolean then 'verified_only' else 'any' end else verification_level end,join_type=case when p_patch?'requires_approval' then case when (p_patch->>'requires_approval')::boolean then 'approval' else 'direct' end else join_type end,post_permission=case when p_patch?'admins_only' then case when (p_patch->>'admins_only')::boolean then 'admins_only' else 'all' end else post_permission end,updated_at=now() where id=p_room_id;
 elsif p_action in ('approve','reject') then
 target:=(p_patch->>'user_id')::integer;
 if not exists(select 1 from public.tbl_community_join_requests where room_id=p_room_id and user_id=target and status='pending') then raise exception 'Pending request not found'; end if;
 if p_action='approve' then
 if r.verification_level='verified_only' and not exists(select 1 from public.tbl_users where id=target and isverified=1) then raise exception 'This member is not verified' using errcode='42501'; end if;
 insert into public.tbl_chat_participants(room_id,user_id,role) values(p_room_id,target,'member') on conflict(room_id,user_id) do nothing;
 end if;
 update public.tbl_community_join_requests set status=case when p_action='approve' then 'approved' else 'rejected' end where room_id=p_room_id and user_id=target;
 elsif p_action='delete' then
 if coalesce((p_patch->>'confirmed')::boolean,false) is not true then raise exception 'Deletion must be confirmed'; end if;
 delete from public.tbl_chat_rooms where id=p_room_id;
 else raise exception 'Unsupported community action'; end if;
 return jsonb_build_object('id',p_room_id,'action',p_action);
 end;
$$;
create or replace function public.community_manage(p_room_id integer,p_action text,p_patch jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.community_manage(p_room_id,p_action,p_patch) $$;

create or replace function private.community_poll(p_action text,p_room_id integer,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare me integer:=public.get_current_app_user_id(); pid integer; mid bigint; oid integer; cid uuid; option_value text; result jsonb;
 begin
 perform public.assert_chat_membership(p_room_id);
 if not exists(select 1 from public.tbl_chat_rooms where id=p_room_id and room_type='community') then raise exception 'Community required'; end if;
 if p_action='create' then
 if not private.community_can_post(p_room_id) then raise exception 'Only community admins can post' using errcode='42501'; end if;
 if length(trim(coalesce(p_payload->>'question',''))) not between 1 and 300 or jsonb_typeof(p_payload->'options') is distinct from 'array' then raise exception 'Enter a question and 2 to 6 options'; end if;
 if jsonb_array_length(p_payload->'options') not between 2 and 6 or exists(select 1 from jsonb_array_elements_text(p_payload->'options') v where v is null or length(trim(v)) not between 1 and 150) then raise exception 'Enter 2 to 6 non-empty options'; end if;
 if (select count(distinct lower(trim(v))) from jsonb_array_elements_text(p_payload->'options') v) <> jsonb_array_length(p_payload->'options') then raise exception 'Options must be different'; end if;
 cid:=(p_payload->>'client_id')::uuid;
 if cid is null then raise exception 'Submission identifier required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||cid::text,0));
 select id into pid from public.tbl_chat_polls where created_by=me and client_id=cid and room_id=p_room_id;
 if pid is null then
 insert into public.tbl_chat_polls(room_id,question,created_by,client_id) values(p_room_id,trim(p_payload->>'question'),me,cid) returning id into pid;
 for option_value in select jsonb_array_elements_text(p_payload->'options') loop insert into public.tbl_chat_poll_options(poll_id,option_text) values(pid,trim(option_value)); end loop;
 insert into public.tbl_messages(room_id,sender_id,content,message_type,poll_id,client_id,is_delivered) values(p_room_id,me,trim(p_payload->>'question'),'poll',pid,cid,true) returning id into mid;
 end if;
 elsif p_action='vote' then
 pid:=(p_payload->>'poll_id')::integer; oid:=(p_payload->>'option_id')::integer;
 if not exists(select 1 from public.tbl_chat_polls p join public.tbl_chat_poll_options o on o.poll_id=p.id where p.id=pid and p.room_id=p_room_id and o.id=oid) then raise exception 'Invalid poll option' using errcode='42501'; end if;
 -- One active vote per member. Choosing another option deliberately changes that vote.
 insert into public.tbl_chat_poll_votes(poll_id,option_id,user_id) values(pid,oid,me) on conflict(poll_id,user_id) do update set option_id=excluded.option_id,created_at=now();
 -- Reuse the private room message change channel; counts are read from the server.
 update public.tbl_messages set edited_at=now() where poll_id=pid;
 elsif p_action='list' then null;
 else raise exception 'Unsupported poll action'; end if;
 select coalesce(jsonb_agg(item order by id),'[]'::jsonb) into result from (
 select p.id,jsonb_build_object('id',p.id,'question',p.question,'created_by',p.created_by,'created_at',p.created_at,'message_id',(select id from public.tbl_messages where poll_id=p.id),'my_option_id',(select option_id from public.tbl_chat_poll_votes where poll_id=p.id and user_id=me),'total_votes',(select count(*) from public.tbl_chat_poll_votes where poll_id=p.id),'options',(select jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text,'votes',(select count(*) from public.tbl_chat_poll_votes v where v.poll_id=p.id and v.option_id=o.id),'percentage',coalesce((select round(100.0*count(*) filter(where v.option_id=o.id)/nullif(count(*),0),1) from public.tbl_chat_poll_votes v where v.poll_id=p.id),0)) order by o.id) from public.tbl_chat_poll_options o where o.poll_id=p.id)) item
 from public.tbl_chat_polls p where p.room_id=p_room_id and (pid is not null and p.id=pid or pid is null and p.id in(select value::integer from jsonb_array_elements_text(coalesce(p_payload->'poll_ids','[]'::jsonb)) as a(value))) limit 51
 ) polls;
 return result;
 end;
$$;
create or replace function public.community_poll(p_action text,p_room_id integer,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.community_poll(p_action,p_room_id,p_payload) $$;
-- Existing poll tables remain RLS-protected. No public vote-count write endpoint exists.
do $$ declare f record; begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('community_manager','community_can_post','community_manage','community_poll','guard_community_posting') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); if f.signature::text not like '%guard_community_posting%' then execute format('grant execute on function %s to authenticated',f.signature); end if; end loop; end $$;
