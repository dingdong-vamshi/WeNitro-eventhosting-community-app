-- WeNitro production hardening: social interactions, privacy, storage, RPCs, and realtime.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists last_active_at timestamptz not null default now();
alter table public.profiles add constraint profiles_adult_age check (date_of_birth is null or date_of_birth <= current_date - interval '18 years') not valid;

create table if not exists public.vibe_comments (
  id uuid primary key default gen_random_uuid(),
  vibe_id uuid not null references public.vibes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.vibe_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'published' check (status in ('published', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_shares (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vibe_id uuid references public.vibes(id) on delete cascade,
  community_post_id uuid references public.community_posts(id) on delete cascade,
  channel text not null check (channel in ('system', 'copy_link', 'direct', 'external')),
  created_at timestamptz not null default now(),
  constraint content_shares_one_target check ((vibe_id is not null)::integer + (community_post_id is not null)::integer = 1)
);

create table if not exists public.user_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('terms', 'privacy', 'analytics', 'personalization', 'marketing', 'location', 'notifications')),
  granted boolean not null,
  policy_version text not null,
  source text not null default 'app' check (source in ('app', 'web', 'support')),
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  discoverable boolean not null default true,
  allow_message_requests boolean not null default true,
  show_distance boolean not null default false,
  follower_approval boolean not null default false,
  analytics boolean not null default false,
  personalization boolean not null default false,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('access', 'correction', 'erasure', 'grievance')),
  details text not null default '' check (char_length(details) <= 4000),
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'completed', 'rejected')),
  due_at timestamptz not null default (now() + interval '30 days'),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id) on delete set null,
  vibe_id uuid references public.vibes(id) on delete set null,
  community_post_id uuid references public.community_posts(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'impersonation', 'privacy', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  check (subject_user_id is not null or vibe_id is not null or community_post_id is not null or message_id is not null)
);

create index if not exists idx_vibe_comments_feed on public.vibe_comments(vibe_id, created_at) where status = 'published';
create index if not exists idx_content_shares_vibe on public.content_shares(vibe_id, created_at desc);
create index if not exists idx_consents_user_purpose on public.user_consents(user_id, purpose, created_at desc);
create index if not exists idx_dsr_open on public.data_subject_requests(status, due_at) where status in ('submitted', 'in_review');
create index if not exists idx_reports_open on public.content_reports(status, created_at) where status in ('open', 'reviewing');
create index if not exists idx_chat_messages_live on public.chat_messages(conversation_id, created_at) where deleted_at is null;

drop trigger if exists set_vibe_comments_updated_at on public.vibe_comments;
create trigger set_vibe_comments_updated_at before update on public.vibe_comments for each row execute function public.set_updated_at();
drop trigger if exists set_privacy_preferences_updated_at on public.privacy_preferences;
create trigger set_privacy_preferences_updated_at before update on public.privacy_preferences for each row execute function public.set_updated_at();
drop trigger if exists set_dsr_updated_at on public.data_subject_requests;
create trigger set_dsr_updated_at before update on public.data_subject_requests for each row execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,username,full_name,avatar_url)
  values(new.id,'user_'||substr(new.id::text,1,8),coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'New member'),new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do nothing;
  insert into public.privacy_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.purge_expired_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.stories where expires_at < now();
  delete from public.chat_messages where deleted_at < now() - interval '30 days';
  delete from public.content_shares where created_at < now() - interval '365 days';
end $$;
revoke all on function private.handle_new_user(), private.purge_expired_data() from public, anon, authenticated;

create or replace function private.is_chat_member(target_conversation_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id is not null and exists (
    select 1 from public.chat_members where conversation_id = target_conversation_id and user_id = target_user_id
  );
$$;

create or replace function private.is_chat_admin(target_conversation_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id is not null and (
    exists (select 1 from public.chat_conversations where id = target_conversation_id and created_by = target_user_id)
    or exists (select 1 from public.chat_members where conversation_id = target_conversation_id and user_id = target_user_id and role = 'admin')
  );
$$;

create or replace function private.is_community_member(target_community_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id is not null and exists (
    select 1 from public.memberships where community_id = target_community_id and user_id = target_user_id and status = 'active'
  );
$$;

create or replace function private.is_community_admin(target_community_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id is not null and (
    exists(select 1 from public.communities where id = target_community_id and owner_id = target_user_id)
    or exists(select 1 from public.memberships where community_id = target_community_id and user_id = target_user_id and role in ('admin','moderator') and status = 'active')
  );
$$;

revoke all on function private.is_chat_member(uuid, uuid), private.is_chat_admin(uuid, uuid), private.is_community_member(uuid, uuid), private.is_community_admin(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_chat_member(uuid, uuid), private.is_chat_admin(uuid, uuid), private.is_community_member(uuid, uuid), private.is_community_admin(uuid, uuid) to authenticated;

drop policy if exists "communities read public or member" on public.communities;
create policy "communities read public or member" on public.communities for select to anon,authenticated using (not is_private or owner_id=(select auth.uid()) or (select private.is_community_member(id)));
drop policy if exists "memberships read self or community" on public.memberships;
create policy "memberships read self or community" on public.memberships for select to authenticated using (user_id=(select auth.uid()) or (select private.is_community_admin(community_id)));
drop policy if exists "memberships update self or owner" on public.memberships;
create policy "memberships update self or owner" on public.memberships for update to authenticated using (user_id=(select auth.uid()) or (select private.is_community_admin(community_id))) with check (user_id=(select auth.uid()) or (select private.is_community_admin(community_id)));
drop policy if exists "memberships delete self or owner" on public.memberships;
create policy "memberships delete self or owner" on public.memberships for delete to authenticated using (user_id=(select auth.uid()) or (select private.is_community_admin(community_id)));

drop policy if exists "conversations read member" on public.chat_conversations;
create policy "conversations read member" on public.chat_conversations for select to authenticated using ((select private.is_chat_member(id)));
drop policy if exists "conversations update admin" on public.chat_conversations;
create policy "conversations update admin" on public.chat_conversations for update to authenticated using ((select private.is_chat_admin(id))) with check ((select private.is_chat_admin(id)));
drop policy if exists "chat members read participants" on public.chat_members;
create policy "chat members read participants" on public.chat_members for select to authenticated using ((select private.is_chat_member(conversation_id)));
drop policy if exists "chat members add self or owner" on public.chat_members;
create policy "chat members add self or owner" on public.chat_members for insert to authenticated with check (user_id = (select auth.uid()) or (select private.is_chat_admin(conversation_id)));
drop policy if exists "chat members update self or owner" on public.chat_members;
create policy "chat members update self or owner" on public.chat_members for update to authenticated using (user_id = (select auth.uid()) or (select private.is_chat_admin(conversation_id))) with check (user_id = (select auth.uid()) or (select private.is_chat_admin(conversation_id)));
drop policy if exists "chat members remove self or owner" on public.chat_members;
create policy "chat members remove self or owner" on public.chat_members for delete to authenticated using (user_id = (select auth.uid()) or (select private.is_chat_admin(conversation_id)));
drop policy if exists "messages read member" on public.chat_messages;
create policy "messages read member" on public.chat_messages for select to authenticated using ((select private.is_chat_member(conversation_id)));
drop policy if exists "messages create member" on public.chat_messages;
create policy "messages create member" on public.chat_messages for insert to authenticated with check (sender_id = (select auth.uid()) and (select private.is_chat_member(conversation_id)));

alter table public.vibe_comments enable row level security;
alter table public.content_shares enable row level security;
alter table public.user_consents enable row level security;
alter table public.privacy_preferences enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;

create policy "vibe comments visible" on public.vibe_comments for select to anon, authenticated using (status = 'published');
create policy "vibe comments create self" on public.vibe_comments for insert to authenticated with check (author_id = (select auth.uid()));
create policy "vibe comments update self" on public.vibe_comments for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "vibe comments delete self" on public.vibe_comments for delete to authenticated using (author_id = (select auth.uid()));
create policy "shares manage self" on public.content_shares for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "consents read self" on public.user_consents for select to authenticated using (user_id = (select auth.uid()));
create policy "consents append self" on public.user_consents for insert to authenticated with check (user_id = (select auth.uid()));
create policy "privacy manage self" on public.privacy_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "requests read self" on public.data_subject_requests for select to authenticated using (user_id = (select auth.uid()));
create policy "requests create self" on public.data_subject_requests for insert to authenticated with check (user_id = (select auth.uid()));
create policy "blocks read self" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks create self" on public.user_blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "blocks delete self" on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));
create policy "reports create self" on public.content_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "reports read self" on public.content_reports for select to authenticated using (reporter_id = (select auth.uid()));

create or replace function public.create_community_with_owner(
  community_name text, community_tagline text, community_description text, community_category text,
  community_tags text[], community_rules text[], community_image_url text, community_cover_url text,
  community_is_private boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; current_user_id uuid := auth.uid(); generated_slug text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if char_length(trim(community_name)) < 3 or char_length(trim(community_description)) < 20 then raise exception 'invalid community details'; end if;
  generated_slug := trim(both '-' from regexp_replace(lower(community_name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.communities(owner_id,name,slug,tagline,description,category,tags,image_url,cover_url,is_private)
  values(current_user_id,trim(community_name),generated_slug,community_tagline,community_description,community_category,coalesce(community_tags,'{}'),community_image_url,community_cover_url,community_is_private)
  returning id into new_id;
  insert into public.memberships(community_id,user_id,role,status) values(new_id,current_user_id,'admin','active');
  insert into public.community_rules(community_id,position,body) select new_id,ordinality,rule from unnest(community_rules) with ordinality as item(rule,ordinality);
  return new_id;
end $$;

create or replace function public.create_chat_group(group_name text, member_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if char_length(trim(group_name)) < 3 or coalesce(array_length(member_ids,1),0) < 1 then raise exception 'invalid group'; end if;
  insert into public.chat_conversations(created_by,kind,name) values(current_user_id,'group',trim(group_name)) returning id into new_id;
  insert into public.chat_members(conversation_id,user_id,role) values(new_id,current_user_id,'admin');
  insert into public.chat_members(conversation_id,user_id,role)
  select new_id,id,'member' from public.profiles where id = any(member_ids) and id <> current_user_id on conflict do nothing;
  return new_id;
end $$;

revoke all on function public.create_community_with_owner(text,text,text,text,text[],text[],text,text,boolean), public.create_chat_group(text,uuid[]) from public, anon;
grant execute on function public.create_community_with_owner(text,text,text,text,text[],text[],text,text,boolean), public.create_chat_group(text,uuid[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
  ('vibes','vibes',true,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
  ('communities','communities',true,20971520,array['image/jpeg','image/png','image/webp']),
  ('stories','stories',true,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
  ('messages','messages',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','application/pdf'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy "public media read" on storage.objects for select to anon, authenticated using (bucket_id in ('avatars','vibes','communities','stories'));
create policy "users upload own media" on storage.objects for insert to authenticated with check (bucket_id in ('avatars','vibes','communities','stories','messages') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update own media" on storage.objects for update to authenticated using (owner_id = (select auth.uid()::text)) with check (owner_id = (select auth.uid()::text));
create policy "users delete own media" on storage.objects for delete to authenticated using (owner_id = (select auth.uid()::text));
create policy "message members read media" on storage.objects for select to authenticated using (bucket_id='messages' and exists(select 1 from public.chat_messages m where m.media_url=name and (select private.is_chat_member(m.conversation_id))));

grant select on public.vibe_comments to anon;
grant select,insert,update,delete on public.vibe_comments,public.content_shares,public.privacy_preferences,public.user_blocks to authenticated;
grant select,insert on public.user_consents,public.data_subject_requests,public.content_reports to authenticated;
grant usage,select on all sequences in schema public to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.vibe_comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_posts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.stories;
exception when duplicate_object then null; end $$;
