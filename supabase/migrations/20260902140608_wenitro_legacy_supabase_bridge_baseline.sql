-- WeNitro legacy Supabase bridge. Target: klyjzbisgycegkkacbjw.
-- Existing integer IDs and rows remain canonical.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.tbl_users add column if not exists auth_user_id uuid;
create unique index if not exists tbl_users_auth_user_id_uidx on public.tbl_users(auth_user_id) where auth_user_id is not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='tbl_users_auth_user_id_fkey') then
    alter table public.tbl_users add constraint tbl_users_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;
alter table public.tbl_events add column if not exists intent varchar(50), add column if not exists price numeric(12,2) not null default 0, add column if not exists currency varchar(3) not null default 'INR';
alter table public.tbl_chat_participants add column if not exists last_read_at timestamptz, add column if not exists muted boolean not null default false;
create unique index if not exists tbl_chat_participants_room_user_uidx on public.tbl_chat_participants(room_id,user_id);
alter table public.tbl_messages add column if not exists client_id uuid, add column if not exists reply_to_id bigint, add column if not exists edited_at timestamptz, add column if not exists deleted_at timestamptz;
create unique index if not exists tbl_messages_sender_client_uidx on public.tbl_messages(sender_id,client_id) where client_id is not null;
alter table public.tbl_notifications add column if not exists title text not null default '', add column if not exists body text not null default '', add column if not exists data jsonb not null default '{}'::jsonb, add column if not exists read_at timestamptz;
alter table public.tbl_user_verification add column if not exists verification_type varchar(30) not null default 'identity', add column if not exists status varchar(30) not null default 'draft', add column if not exists document_path text, add column if not exists document_mime varchar(100), add column if not exists document_size integer, add column if not exists review_notes text not null default '', add column if not exists submitted_at timestamptz, add column if not exists reviewed_at timestamptz;

create table if not exists public.tbl_community_posts(id bigserial primary key,room_id integer not null references public.tbl_chat_rooms(id) on delete cascade,user_id integer not null references public.tbl_users(id) on delete cascade,title varchar(180),body text not null default '',media_url text,media_type varchar(30),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz);
create table if not exists public.tbl_community_post_comments(id bigserial primary key,post_id bigint not null references public.tbl_community_posts(id) on delete cascade,user_id integer not null references public.tbl_users(id) on delete cascade,body text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz);
create table if not exists public.tbl_community_post_reactions(id bigserial primary key,post_id bigint not null references public.tbl_community_posts(id) on delete cascade,user_id integer not null references public.tbl_users(id) on delete cascade,reaction varchar(30) not null default 'like',created_at timestamptz not null default now(),unique(post_id,user_id,reaction));
create table if not exists public.tbl_stories(id bigserial primary key,user_id integer not null references public.tbl_users(id) on delete cascade,media_url text not null,media_type varchar(30) not null,caption text not null default '',created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '24 hours'),deleted_at timestamptz);
create table if not exists public.tbl_story_views(story_id bigint not null references public.tbl_stories(id) on delete cascade,viewer_id integer not null references public.tbl_users(id) on delete cascade,viewed_at timestamptz not null default now(),primary key(story_id,viewer_id));
create table if not exists public.tbl_badges(id serial primary key,slug varchar(80) not null unique,name varchar(120) not null,description text not null default '',icon text,created_at timestamptz not null default now());
create table if not exists public.tbl_user_badges(user_id integer not null references public.tbl_users(id) on delete cascade,badge_id integer not null references public.tbl_badges(id) on delete cascade,awarded_at timestamptz not null default now(),awarded_by integer references public.tbl_users(id) on delete set null,primary key(user_id,badge_id));

create or replace function public.current_app_user_id() returns integer language sql stable security definer set search_path=public as $$ select id from public.tbl_users where auth_user_id=auth.uid() limit 1 $$;
create or replace function public.get_current_app_user_id() returns integer language plpgsql stable security definer set search_path=public as $$ declare v integer; begin select id into v from public.tbl_users where auth_user_id=auth.uid() limit 1; if v is null then raise exception 'Account is not linked to an app user' using errcode='42501'; end if; return v; end $$;
create or replace function public.is_wenitro_admin() returns boolean language sql stable as $$ select coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','super_admin') $$;
create or replace function public.is_chat_member(p_room_id integer) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.tbl_chat_participants where room_id=p_room_id and user_id=public.current_app_user_id()) $$;

create or replace function private.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public,auth as $$
declare v integer; n text; f text;
begin
 select id into v from public.tbl_users where lower(email)=lower(new.email) order by id limit 1;
 if v is not null then update public.tbl_users set auth_user_id=new.id,is_active=1,is_delete=0 where id=v;
 else
  n:=left(coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(new.email,'@',1),'member')||'_'||left(new.id::text,8),100);
  f:=left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'fullname',''),split_part(new.email,'@',1),'WeNitro member'),150);
  insert into public.tbl_users(username,fullname,email,password,is_active,is_delete,auth_user_id) values(n,f,new.email,'supabase-auth-managed',1,0,new.id) returning id into v;
 end if;
 insert into public.tbl_user_privacy_settings(user_id) values(v) on conflict(user_id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created_wenitro on auth.users;
create trigger on_auth_user_created_wenitro after insert on auth.users for each row execute function private.handle_new_auth_user();

create or replace function public.assert_chat_membership(p_room_id integer) returns boolean language plpgsql stable security definer set search_path=public as $$ begin if not public.is_chat_member(p_room_id) then raise exception 'Not a chat member' using errcode='42501'; end if; return true; end $$;
create or replace function public.create_direct_chat_room(p_other_user_id integer) returns integer language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); rid integer;
begin
 if p_other_user_id=me or not exists(select 1 from public.tbl_users where id=p_other_user_id and coalesce(is_delete,0)=0) then raise exception 'Invalid participant'; end if;
 select r.id into rid from public.tbl_chat_rooms r where r.room_type='personal' and exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=me) and exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=p_other_user_id) and (select count(*) from public.tbl_chat_participants p where p.room_id=r.id)=2 order by r.id limit 1;
 if rid is null then insert into public.tbl_chat_rooms(room_type,created_by) values('personal',me) returning id into rid; insert into public.tbl_chat_participants(room_id,user_id,role) values(rid,me,'admin'),(rid,p_other_user_id,'member') on conflict(room_id,user_id) do nothing; end if;
 return rid;
end $$;
create or replace function public.create_group_chat_room(p_title text,p_member_ids integer[]) returns integer language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); rid integer;
begin
 if length(trim(p_title)) not between 3 and 80 then raise exception 'Invalid group title'; end if;
 insert into public.tbl_chat_rooms(room_type,created_by,title) values('group',me,trim(p_title)) returning id into rid;
 insert into public.tbl_chat_participants(room_id,user_id,role) values(rid,me,'admin');
 insert into public.tbl_chat_participants(room_id,user_id,role) select rid,u.id,'member' from public.tbl_users u where u.id=any(coalesce(p_member_ids,'{}')) and u.id<>me on conflict(room_id,user_id) do nothing;
 return rid;
end $$;
create or replace function public.list_chat_participants(p_room_id integer) returns setof jsonb language plpgsql stable security definer set search_path=public as $$ begin perform public.assert_chat_membership(p_room_id); return query select jsonb_build_object('room_id',p.room_id,'user_id',p.user_id,'role',coalesce(p.role,'member'),'last_read_at',p.last_read_at,'muted',p.muted,'joined_at',p.joined_at,'user',jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image)) from public.tbl_chat_participants p join public.tbl_users u on u.id=p.user_id where p.room_id=p_room_id order by p.joined_at; end $$;
create or replace function public.list_chat_messages(p_room_id integer,p_before_created_at timestamptz default null,p_before_id bigint default null,p_limit integer default 51,p_include_deleted boolean default false) returns setof jsonb language plpgsql stable security definer set search_path=public as $$ begin perform public.assert_chat_membership(p_room_id); return query select to_jsonb(m)||jsonb_build_object('sender',jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image)) from public.tbl_messages m left join public.tbl_users u on u.id=m.sender_id where m.room_id=p_room_id and (p_include_deleted or m.deleted_at is null) and (p_before_created_at is null or (m.created_at,m.id)<(p_before_created_at,coalesce(p_before_id,9223372036854775807))) order by m.created_at desc,m.id desc limit least(greatest(p_limit,1),101); end $$;
create or replace function public.send_chat_message(p_room_id integer,p_client_id uuid,p_content text,p_message_type text default 'text',p_media_url text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); m public.tbl_messages; u public.tbl_users;
begin perform public.assert_chat_membership(p_room_id); if length(coalesce(p_content,''))>10000 or (trim(coalesce(p_content,''))='' and p_media_url is null) then raise exception 'Invalid message'; end if; if p_message_type not in ('text','image','video','audio','document') then raise exception 'Invalid message type'; end if; insert into public.tbl_messages(room_id,sender_id,content,message_type,media_url,client_id,is_delivered) values(p_room_id,me,coalesce(p_content,''),p_message_type,p_media_url,p_client_id,true) on conflict(sender_id,client_id) where client_id is not null do update set client_id=excluded.client_id returning * into m; select * into u from public.tbl_users where id=me; return to_jsonb(m)||jsonb_build_object('sender',jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image)); end $$;
create or replace function public.mark_chat_read(p_room_id integer,p_read_at timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public as $$ declare me integer:=public.get_current_app_user_id(); at timestamptz:=least(coalesce(p_read_at,now()),now()); begin perform public.assert_chat_membership(p_room_id); update public.tbl_chat_participants set last_read_at=at where room_id=p_room_id and user_id=me; update public.tbl_messages set is_read=true where room_id=p_room_id and sender_id<>me and created_at<=at; return jsonb_build_object('room_id',p_room_id,'user_id',me,'last_read_at',at); end $$;

create or replace function public.list_user_notifications(p_limit integer default 51,p_before_id integer default null) returns setof public.tbl_notifications language sql stable security definer set search_path=public as $$ select * from public.tbl_notifications where user_id=public.get_current_app_user_id() and (p_before_id is null or id<p_before_id) order by id desc limit least(greatest(p_limit,1),101) $$;
create or replace function public.mark_notification_read(p_notification_id integer) returns void language plpgsql security definer set search_path=public as $$ begin update public.tbl_notifications set is_read=true,read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=public.get_current_app_user_id(); end $$;
create or replace function public.mark_all_notifications_read() returns void language plpgsql security definer set search_path=public as $$ begin update public.tbl_notifications set is_read=true,read_at=coalesce(read_at,now()) where user_id=public.get_current_app_user_id() and not is_read; end $$;

create or replace function public.get_user_privacy_settings() returns public.tbl_user_privacy_settings language plpgsql security definer set search_path=public as $$ declare me integer:=public.get_current_app_user_id(); r public.tbl_user_privacy_settings; begin insert into public.tbl_user_privacy_settings(user_id) values(me) on conflict(user_id) do nothing; select * into r from public.tbl_user_privacy_settings where user_id=me; return r; end $$;
create or replace function public.update_user_privacy_settings(p_profile_visibility text default null,p_email_visibility text default null,p_phone_visibility text default null,p_message_visibility text default null,p_show_online_status boolean default null) returns public.tbl_user_privacy_settings language plpgsql security definer set search_path=public as $$
declare me integer:=public.get_current_app_user_id(); r public.tbl_user_privacy_settings;
begin
 if p_profile_visibility is not null and p_profile_visibility not in ('public','friends','private') then raise exception 'Invalid profile visibility'; end if; if p_email_visibility is not null and p_email_visibility not in ('public','friends','private') then raise exception 'Invalid email visibility'; end if; if p_phone_visibility is not null and p_phone_visibility not in ('public','friends','private') then raise exception 'Invalid phone visibility'; end if; if p_message_visibility is not null and p_message_visibility not in ('everyone','friends','none') then raise exception 'Invalid message visibility'; end if;
 insert into public.tbl_user_privacy_settings(user_id) values(me) on conflict(user_id) do nothing;
 update public.tbl_user_privacy_settings set profile_visibility=coalesce(p_profile_visibility,profile_visibility),email_visibility=coalesce(p_email_visibility,email_visibility),phone_visibility=coalesce(p_phone_visibility,phone_visibility),message_visibility=coalesce(p_message_visibility,message_visibility),show_online_status=coalesce(p_show_online_status,show_online_status),updated_at=now() where user_id=me returning * into r; return r;
end $$;

create or replace function public.list_user_verifications() returns setof public.tbl_user_verification language sql stable security definer set search_path=public as $$ select * from public.tbl_user_verification where user_id=public.get_current_app_user_id() order by created_at desc $$;
create or replace function public.create_verification_draft(p_verification_type text default 'identity') returns public.tbl_user_verification language plpgsql security definer set search_path=public as $$ declare r public.tbl_user_verification; begin if p_verification_type<>'identity' then raise exception 'Unsupported verification type'; end if; insert into public.tbl_user_verification(user_id,phone_verified,aadhaar_verified,verification_type,status) values(public.get_current_app_user_id(),false,false,p_verification_type,'draft') returning * into r; return r; end $$;
create or replace function public.finalize_verification(p_verification_id integer,p_document_path text,p_document_mime text,p_document_size integer) returns public.tbl_user_verification language plpgsql security definer set search_path=public as $$ declare aid uuid:=auth.uid(); r public.tbl_user_verification; begin if p_document_mime not in ('image/jpeg','image/png','application/pdf') or p_document_size not between 1 and 10485760 or p_document_path not like aid::text||'/%' then raise exception 'Invalid verification document'; end if; update public.tbl_user_verification set document_path=p_document_path,document_mime=p_document_mime,document_size=p_document_size,status='submitted',submitted_at=now(),updated_at=now() where id=p_verification_id and user_id=public.get_current_app_user_id() and status='draft' returning * into r; if r.id is null then raise exception 'Verification draft not found' using errcode='42501'; end if; return r; end $$;
create or replace function public.discard_verification_draft(p_verification_id integer) returns void language plpgsql security definer set search_path=public as $$ begin delete from public.tbl_user_verification where id=p_verification_id and user_id=public.get_current_app_user_id() and status='draft'; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']),('activity-media','activity-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4']),('vibes','vibes',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4']),('stories','stories',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4']),('community','community',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4']),('messages','messages',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/mp4','application/pdf']),('verification','verification',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Default deny on all public tables. Admin JWT role remains a controlled escape hatch.
do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',r.tablename);
  execute format('revoke all on table public.%I from anon,authenticated',r.tablename);
  execute format('grant select,insert,update,delete on table public.%I to authenticated',r.tablename);
  execute format('drop policy if exists wenitro_admin_all on public.%I',r.tablename);
  execute format('create policy wenitro_admin_all on public.%I for all to authenticated using (public.is_wenitro_admin()) with check (public.is_wenitro_admin())',r.tablename);
 end loop;
end $$;
grant usage,select on all sequences in schema public to authenticated;

revoke select on public.tbl_users from authenticated;
grant select(id,username,fullname,is_active,is_delete,create_at,bio,dob,gender,isverified,profile_image,rating,points,nationality,about,occupation) on public.tbl_users to authenticated;
create policy app_profiles_read on public.tbl_users for select to authenticated using(coalesce(is_delete,0)=0);
create policy own_profile_update on public.tbl_users for update to authenticated using(id=public.current_app_user_id()) with check(id=public.current_app_user_id());
grant select on public.tbl_categories,public.tbl_events,public.tbl_event_categories to anon;
create policy categories_read on public.tbl_categories for select to anon,authenticated using(true);
create policy public_events_read on public.tbl_events for select to anon using(visibility_type='public' and not coalesce(is_deleted,false));
create policy app_events_read on public.tbl_events for select to authenticated using(not coalesce(is_deleted,false) and (visibility_type='public' or created_by=public.current_app_user_id() or exists(select 1 from public.tbl_event_participants p where p.event_id=id and p.user_id=public.current_app_user_id())));
create policy event_categories_read on public.tbl_event_categories for select to anon,authenticated using(true);
create policy participants_read on public.tbl_event_participants for select to authenticated using(user_id=public.current_app_user_id() or status='approved' or exists(select 1 from public.tbl_events e where e.id=event_id and e.created_by=public.current_app_user_id()));
create policy own_event_likes on public.tbl_event_likes for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
create policy own_event_saves on public.tbl_event_saves for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
create policy chat_rooms_read on public.tbl_chat_rooms for select to authenticated using(room_type='community' or public.is_chat_member(id));
create policy chat_participants_read on public.tbl_chat_participants for select to authenticated using(public.is_chat_member(room_id));
create policy chat_messages_read on public.tbl_messages for select to authenticated using(public.is_chat_member(room_id));
create policy own_notifications on public.tbl_notifications for select to authenticated using(user_id=public.current_app_user_id());
create policy own_privacy on public.tbl_user_privacy_settings for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
create policy own_verification on public.tbl_user_verification for select to authenticated using(user_id=public.current_app_user_id());
create policy vibes_read on public.tbl_activity_vibes for select to authenticated using(true);
create policy own_vibes_write on public.tbl_activity_vibes for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
create policy vibe_likes_read on public.tbl_vibe_likes for select to authenticated using(true);
create policy own_vibe_likes on public.tbl_vibe_likes for insert to authenticated with check(user_id=public.current_app_user_id());
create policy vibe_comments_read on public.tbl_vibe_comments for select to authenticated using(true);
create policy own_vibe_comments on public.tbl_vibe_comments for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
create policy community_requests_scope on public.tbl_community_join_requests for all to authenticated using(user_id=public.current_app_user_id() or exists(select 1 from public.tbl_chat_rooms r where r.id=room_id and r.created_by=public.current_app_user_id())) with check(user_id=public.current_app_user_id() or exists(select 1 from public.tbl_chat_rooms r where r.id=room_id and r.created_by=public.current_app_user_id()));
create policy community_posts_read on public.tbl_community_posts for select to authenticated using(public.is_chat_member(room_id));
create policy community_posts_write on public.tbl_community_posts for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id() and public.is_chat_member(room_id));
create policy stories_read on public.tbl_stories for select to authenticated using(deleted_at is null and expires_at>now());
create policy stories_owner on public.tbl_stories for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
create policy story_views_owner on public.tbl_story_views for all to authenticated using(viewer_id=public.current_app_user_id()) with check(viewer_id=public.current_app_user_id());
create policy badges_read on public.tbl_badges for select to authenticated using(true);
create policy user_badges_read on public.tbl_user_badges for select to authenticated using(true);

create policy avatars_public_read on storage.objects for select to public using(bucket_id='avatars');
create policy owner_storage_insert on storage.objects for insert to authenticated with check(bucket_id in ('avatars','activity-media','vibes','stories','community','messages','verification') and (storage.foldername(name))[1]=auth.uid()::text);
create policy owner_storage_update on storage.objects for update to authenticated using(owner_id=auth.uid()::text) with check(owner_id=auth.uid()::text);
create policy owner_storage_delete on storage.objects for delete to authenticated using(owner_id=auth.uid()::text);
create policy private_media_read on storage.objects for select to authenticated using(bucket_id in ('activity-media','vibes','stories','community') or (bucket_id in ('messages','verification') and owner_id=auth.uid()::text));

revoke execute on all functions in schema public from public,anon;
grant execute on function public.current_app_user_id(),public.get_current_app_user_id(),public.is_wenitro_admin(),public.is_chat_member(integer),public.assert_chat_membership(integer),public.create_direct_chat_room(integer),public.create_group_chat_room(text,integer[]),public.list_chat_participants(integer),public.list_chat_messages(integer,timestamptz,bigint,integer,boolean),public.send_chat_message(integer,uuid,text,text,text),public.mark_chat_read(integer,timestamptz),public.list_user_notifications(integer,integer),public.mark_notification_read(integer),public.mark_all_notifications_read(),public.get_user_privacy_settings(),public.update_user_privacy_settings(text,text,text,text,boolean),public.list_user_verifications(),public.create_verification_draft(text),public.finalize_verification(integer,text,text,integer),public.discard_verification_draft(integer) to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tbl_messages') then alter publication supabase_realtime add table public.tbl_messages; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tbl_notifications') then alter publication supabase_realtime add table public.tbl_notifications; end if;
end $$;
insert into public.tbl_badges(slug,name,description,icon) values('verified','Verified','Identity verification approved','shield-check'),('host','Host','Created an activity','calendar-plus'),('community-builder','Community Builder','Created or moderated a community','users') on conflict(slug) do update set name=excluded.name,description=excluded.description,icon=excluded.icon;
