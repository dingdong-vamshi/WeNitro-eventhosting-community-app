create or replace function private.in_squad(target integer) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.tbl_friends where (user_id=public.current_app_user_id() and friend_id=target) or (friend_id=public.current_app_user_id() and user_id=target)) $$;
create or replace function private.can_read_profile(p_target_user_id integer) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_target_user_id=public.current_app_user_id() or public.is_wenitro_admin() or coalesce((select profile_visibility from public.tbl_user_privacy_settings where user_id=p_target_user_id),'public')='public' or (coalesce((select profile_visibility from public.tbl_user_privacy_settings where user_id=p_target_user_id),'public')='friends' and private.in_squad(p_target_user_id)));
$$;
create or replace function private.may_message(target integer) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and (target=public.current_app_user_id() or coalesce((select message_visibility from public.tbl_user_privacy_settings where user_id=target),'everyone')='everyone' or ((select message_visibility from public.tbl_user_privacy_settings where user_id=target)='friends' and private.in_squad(target))) $$;
-- A BEFORE trigger covers direct-room creation and future messages in existing rooms.
create or replace function private.guard_direct_contact() returns trigger language plpgsql security definer set search_path='' as $$
 declare target integer;
 begin
 if auth.uid() is null then return new; end if;
 if exists(select 1 from public.tbl_chat_rooms where id=new.room_id and room_type='personal') then
 if tg_table_name='tbl_chat_participants' then target:=new.user_id; if not private.may_message(target) then raise exception 'This member only accepts messages from their Squad' using errcode='42501'; end if;
 else for target in select user_id from public.tbl_chat_participants where room_id=new.room_id and user_id<>public.current_app_user_id() loop if not private.may_message(target) then raise exception 'This member is not accepting messages from you' using errcode='42501'; end if; end loop; end if;
 end if;
 return new;
 end;
$$;
create trigger guard_direct_contact_members before insert on public.tbl_chat_participants for each row execute function private.guard_direct_contact();
create trigger guard_direct_contact_messages before insert on public.tbl_messages for each row execute function private.guard_direct_contact();

create or replace function private.profile_contact(p_user_id integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare u public.tbl_users; s public.tbl_user_privacy_settings; own boolean; friend boolean;
 begin
 perform public.get_current_app_user_id();
 if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
 select * into u from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
 if not found then raise exception 'Profile unavailable'; end if;
 select * into s from public.tbl_user_privacy_settings where user_id=p_user_id;
 own:=p_user_id=public.current_app_user_id(); friend:=private.in_squad(p_user_id);
 return jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image,'bio',u.bio,'is_verified',u.isverified=1,'email',case when own or coalesce(s.email_visibility,'friends')='public' or (coalesce(s.email_visibility,'friends')='friends' and friend) then u.email else null end,'phone',case when own or coalesce(s.phone_visibility,'friends')='public' or (coalesce(s.phone_visibility,'friends')='friends' and friend) then coalesce(u.phone_e164,u.countrycode||u.phonenumber::text) else null end,'can_message',private.may_message(p_user_id));
 end;
$$;
create or replace function public.profile_contact(p_user_id integer) returns jsonb language sql security invoker set search_path='' as $$ select private.profile_contact(p_user_id) $$;
create or replace function private.visible_online_users(p_user_ids integer[]) returns integer[] language sql stable security definer set search_path='' as $$ select coalesce(array_agg(u.id),'{}'::integer[]) from public.tbl_users u where auth.uid() is not null and u.id=any(p_user_ids[1:100]) and private.can_read_profile(u.id) and coalesce((select show_online_status from public.tbl_user_privacy_settings where user_id=u.id),true) $$;
create or replace function public.visible_online_users(p_user_ids integer[]) returns integer[] language sql security invoker set search_path='' as $$ select private.visible_online_users(p_user_ids) $$;
create or replace function private.may_publish_presence() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and coalesce((select show_online_status from public.tbl_user_privacy_settings where user_id=public.current_app_user_id()),true) $$;
alter policy "chat members can send realtime messages" on realtime.messages with check (case when realtime.topic() ~ '^room:[1-9][0-9]*$' then public.is_chat_member(split_part(realtime.topic(),':',2)::integer) and (extension<>'presence' or private.may_publish_presence()) else false end);

-- Deactivation is separate from onboarding/account type, and does not delete social data.
alter table public.tbl_users add column if not exists deactivated_at timestamptz;
create or replace function public.current_app_user_id() returns integer language sql stable security definer set search_path='' as $$ select id from public.tbl_users where auth_user_id=auth.uid() and deactivated_at is null limit 1 $$;
create or replace function public.get_current_app_user_id() returns integer language plpgsql stable security definer set search_path='' as $$ declare v integer; begin v:=public.current_app_user_id(); if v is null then raise exception 'Account unavailable or deactivated' using errcode='42501'; end if; return v; end $$;
create or replace function private.deactivate_my_account(p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$ declare me integer:=public.get_current_app_user_id(); begin if p_confirmed is not true then raise exception 'Account deactivation must be confirmed'; end if; update public.tbl_users set is_active=0,deactivated_at=now() where id=me; end $$;
create or replace function public.deactivate_my_account(p_confirmed boolean) returns void language sql security invoker set search_path='' as $$ select private.deactivate_my_account(p_confirmed) $$;

do $$ declare f record; begin for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('in_squad','can_read_profile','may_message','guard_direct_contact','profile_contact','visible_online_users','may_publish_presence','deactivate_my_account') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); if f.proname<>'guard_direct_contact' then execute format('grant execute on function %s to authenticated',f.signature); end if; end loop; end $$;
