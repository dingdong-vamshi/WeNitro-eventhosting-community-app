-- Operational identity and notification primitives for the production client.

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  verification_type text not null check (verification_type in ('identity', 'phone', 'email', 'social')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewing', 'approved', 'rejected')),
  document_path text,
  submitted_data jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_notes text not null default '' check (char_length(review_notes) <= 2000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (notification_type in ('message', 'vibe_comment', 'activity_join', 'community_join', 'verification', 'system')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 500),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_verification_requests_user_status
  on public.verification_requests(user_id, status, created_at desc);
create unique index if not exists idx_verification_one_active_per_type
  on public.verification_requests(user_id, verification_type)
  where status in ('draft', 'submitted', 'reviewing');
create index if not exists idx_notifications_user_feed
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists idx_push_tokens_user_active
  on public.device_push_tokens(user_id) where active;

drop trigger if exists set_verification_requests_updated_at on public.verification_requests;
create trigger set_verification_requests_updated_at before update on public.verification_requests
for each row execute function public.set_updated_at();
drop trigger if exists set_device_push_tokens_updated_at on public.device_push_tokens;
create trigger set_device_push_tokens_updated_at before update on public.device_push_tokens
for each row execute function public.set_updated_at();

create or replace function private.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin'), false);
$$;
revoke all on function private.is_app_admin() from public, anon;
grant execute on function private.is_app_admin() to authenticated;

alter table public.verification_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.device_push_tokens enable row level security;

create policy "verification read self or admin" on public.verification_requests
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_app_admin()));
create policy "verification create self" on public.verification_requests
for insert to authenticated
with check (user_id = (select auth.uid()) and status in ('draft', 'submitted') and reviewer_id is null);
create policy "verification edit own draft" on public.verification_requests
for update to authenticated
using (user_id = (select auth.uid()) and status = 'draft')
with check (user_id = (select auth.uid()) and status in ('draft', 'submitted') and reviewer_id is null);
create policy "verification review admin" on public.verification_requests
for update to authenticated
using ((select private.is_app_admin()))
with check ((select private.is_app_admin()));

create policy "notifications read self" on public.notifications
for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications update self" on public.notifications
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "notifications delete self" on public.notifications
for delete to authenticated using (user_id = (select auth.uid()));

create policy "push tokens manage self" on public.device_push_tokens
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update on public.verification_requests to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.device_push_tokens to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('verification-documents', 'verification-documents', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "verification documents insert own" on storage.objects
for insert to authenticated
with check (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "verification documents select own" on storage.objects
for select to authenticated
using (bucket_id = 'verification-documents' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_app_admin())));
create policy "verification documents update own" on storage.objects
for update to authenticated
using (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "verification documents delete own draft" on storage.objects
for delete to authenticated
using (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function private.emit_social_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'chat_messages' then
    insert into public.notifications(user_id, actor_id, notification_type, title, body, data)
    select cm.user_id, new.sender_id, 'message', 'New message', left(coalesce(nullif(new.body, ''), 'Shared an attachment'), 500),
      jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
    from public.chat_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id and not cm.muted;
  elsif tg_table_name = 'vibe_comments' then
    insert into public.notifications(user_id, actor_id, notification_type, title, body, data)
    select v.user_id, new.author_id, 'vibe_comment', 'New comment on your vibe', left(new.body, 500),
      jsonb_build_object('vibe_id', new.vibe_id, 'comment_id', new.id)
    from public.vibes v where v.id = new.vibe_id and v.user_id <> new.author_id;
  elsif tg_table_name = 'participants' and new.status = 'joined' then
    insert into public.notifications(user_id, actor_id, notification_type, title, body, data)
    select a.owner_id, new.user_id, 'activity_join', 'Someone joined your activity', a.title,
      jsonb_build_object('activity_id', new.activity_id)
    from public.activities a where a.id = new.activity_id and a.owner_id <> new.user_id;
  elsif tg_table_name = 'memberships' and new.status = 'active' then
    insert into public.notifications(user_id, actor_id, notification_type, title, body, data)
    select c.owner_id, new.user_id, 'community_join', 'New community member', c.name,
      jsonb_build_object('community_id', new.community_id)
    from public.communities c where c.id = new.community_id and c.owner_id <> new.user_id;
  end if;
  return new;
end $$;
revoke all on function private.emit_social_notification() from public, anon, authenticated;

drop trigger if exists notify_chat_message on public.chat_messages;
create trigger notify_chat_message after insert on public.chat_messages
for each row execute function private.emit_social_notification();
drop trigger if exists notify_vibe_comment on public.vibe_comments;
create trigger notify_vibe_comment after insert on public.vibe_comments
for each row execute function private.emit_social_notification();
drop trigger if exists notify_activity_join on public.participants;
create trigger notify_activity_join after insert or update of status on public.participants
for each row execute function private.emit_social_notification();
drop trigger if exists notify_community_join on public.memberships;
create trigger notify_community_join after insert or update of status on public.memberships
for each row execute function private.emit_social_notification();

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
