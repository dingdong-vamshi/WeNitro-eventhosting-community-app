-- WeNitro Supabase-ready schema

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  avatar_url text,
  bio text,
  website text,
  location text,
  trust_score integer not null default 0 check (trust_score between 0 and 100),
  karma numeric(4,2) not null default 0 check (karma between 0 and 5),
  nitro_points integer not null default 0 check (nitro_points >= 0),
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 30)
);

create table if not exists public.interests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_interests (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, interest_id)
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null unique,
  slug text not null unique,
  description text,
  cover_url text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communities_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

alter table public.communities add column if not exists tagline text;
alter table public.communities add column if not exists category text not null default 'Social';
alter table public.communities add column if not exists image_url text;
alter table public.communities add column if not exists tags text[] not null default '{}';
alter table public.communities add column if not exists is_verified boolean not null default false;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  title text not null,
  description text,
  category text not null,
  cover_url text,
  location_name text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  price_inr numeric(10,2) not null default 0 check (price_inr >= 0),
  capacity integer not null default 2 check (capacity > 0),
  match_score integer check (match_score between 0 and 100),
  activity_type text not null default 'meetup',
  visibility text not null default 'public',
  status text not null default 'published',
  starts_at timestamptz not null,
  ends_at timestamptz,
  registration_closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_visibility_check check (visibility in ('public', 'community', 'private')),
  constraint activities_type_check check (activity_type in ('meetup', 'sport', 'study', 'cowork', 'tournament')),
  constraint activities_status_check check (status in ('draft', 'published', 'cancelled', 'completed')),
  constraint activities_time_check check (ends_at is null or ends_at >= starts_at),
  constraint activities_registration_check check (registration_closes_at is null or registration_closes_at <= starts_at),
  constraint activities_coordinates_check check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create table if not exists public.participants (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant',
  status text not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id),
  constraint participants_role_check check (role in ('participant', 'host', 'cohost')),
  constraint participants_status_check check (status in ('going', 'interested', 'declined', 'waitlist'))
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vibes (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text not null default '',
  hashtags text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'activity')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete cascade,
  vibe_id uuid references public.vibes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_one_target check ((activity_id is not null)::integer + (vibe_id is not null)::integer = 1)
);

create table if not exists public.saves (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete cascade,
  vibe_id uuid references public.vibes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saves_one_target check ((activity_id is not null)::integer + (vibe_id is not null)::integer = 1)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create table if not exists public.memberships (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id),
  constraint memberships_role_check check (role in ('member', 'moderator', 'admin')),
  constraint memberships_status_check check (status in ('active', 'pending', 'blocked'))
);

create table if not exists public.community_rules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  position integer not null check (position > 0),
  body text not null check (char_length(body) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, position)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '',
  category text not null default 'General',
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video')),
  status text not null default 'published' check (status in ('draft', 'published', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like', 'love', 'laugh', 'support')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.community_post_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('direct', 'group')),
  name text,
  avatar_url text,
  activity_id uuid references public.activities(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_group_name check (kind = 'direct' or char_length(name) between 3 and 80)
);

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video', 'audio', 'document')),
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chat_message_content check (char_length(body) > 0 or media_url is not null)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'close_friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint story_expiry check (expires_at > created_at)
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

-- SECURITY DEFINER helpers keep chat RLS checks non-recursive while still binding
-- every decision to the authenticated user's UUID.
create or replace function public.is_chat_member(target_conversation_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where conversation_id = target_conversation_id and user_id = target_user_id
  );
$$;

create or replace function public.is_chat_admin(target_conversation_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_conversations
    where id = target_conversation_id and created_by = target_user_id
  ) or exists (
    select 1 from public.chat_members
    where conversation_id = target_conversation_id and user_id = target_user_id and role = 'admin'
  );
$$;

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  awarded_at timestamptz not null default now(),
  note text,
  primary key (user_id, badge_id)
);

create index if not exists idx_communities_owner_id on public.communities(owner_id);
create index if not exists idx_profile_interests_interest_id on public.profile_interests(interest_id);
create index if not exists idx_activities_owner_id on public.activities(owner_id);
create index if not exists idx_activities_community_id on public.activities(community_id);
create index if not exists idx_activities_created_at on public.activities(created_at desc);
create index if not exists idx_activities_location_time on public.activities(location_name, starts_at);
create index if not exists idx_participants_user_id on public.participants(user_id);
create index if not exists idx_comments_activity_id on public.comments(activity_id);
create index if not exists idx_comments_author_id on public.comments(author_id);
create index if not exists idx_comments_parent_id on public.comments(parent_id);
create index if not exists idx_vibes_activity_id on public.vibes(activity_id);
create index if not exists idx_vibes_user_id on public.vibes(user_id);
create index if not exists idx_likes_user_id on public.likes(user_id);
create index if not exists idx_saves_user_id on public.saves(user_id);
create unique index if not exists idx_likes_activity_unique on public.likes(user_id, activity_id) where activity_id is not null;
create unique index if not exists idx_likes_vibe_unique on public.likes(user_id, vibe_id) where vibe_id is not null;
create unique index if not exists idx_saves_activity_unique on public.saves(user_id, activity_id) where activity_id is not null;
create unique index if not exists idx_saves_vibe_unique on public.saves(user_id, vibe_id) where vibe_id is not null;
create index if not exists idx_follows_following_id on public.follows(following_id);
create index if not exists idx_memberships_user_id on public.memberships(user_id);
create index if not exists idx_memberships_community_id on public.memberships(community_id);
create index if not exists idx_communities_category on public.communities(category);
create index if not exists idx_communities_tags on public.communities using gin(tags);
create index if not exists idx_community_rules_community on public.community_rules(community_id, position);
create index if not exists idx_community_posts_feed on public.community_posts(community_id, created_at desc) where status = 'published';
create index if not exists idx_community_posts_author on public.community_posts(author_id, created_at desc);
create index if not exists idx_community_reactions_user on public.community_post_reactions(user_id);
create index if not exists idx_community_comments_post on public.community_post_comments(post_id, created_at);
create index if not exists idx_community_comments_author on public.community_post_comments(author_id);
create index if not exists idx_chat_conversations_creator on public.chat_conversations(created_by, updated_at desc);
create index if not exists idx_chat_members_user on public.chat_members(user_id, joined_at desc);
create index if not exists idx_chat_messages_feed on public.chat_messages(conversation_id, created_at desc) where deleted_at is null;
create index if not exists idx_chat_messages_sender on public.chat_messages(sender_id, created_at desc);
create index if not exists idx_stories_active on public.stories(created_at desc) where expires_at > created_at;
create index if not exists idx_stories_owner on public.stories(owner_id, created_at desc);
create index if not exists idx_story_views_viewer on public.story_views(viewer_id, viewed_at desc);
create index if not exists idx_user_badges_badge_id on public.user_badges(badge_id);
create index if not exists idx_user_badges_awarded_by on public.user_badges(awarded_by);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_interests_updated_at on public.interests;
create trigger set_interests_updated_at
before update on public.interests
for each row execute function public.set_updated_at();

drop trigger if exists set_communities_updated_at on public.communities;
create trigger set_communities_updated_at
before update on public.communities
for each row execute function public.set_updated_at();

drop trigger if exists set_activities_updated_at on public.activities;
create trigger set_activities_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

drop trigger if exists set_participants_updated_at on public.participants;
create trigger set_participants_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

drop trigger if exists set_comments_updated_at on public.comments;
create trigger set_comments_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

drop trigger if exists set_vibes_updated_at on public.vibes;
create trigger set_vibes_updated_at
before update on public.vibes
for each row execute function public.set_updated_at();

drop trigger if exists set_memberships_updated_at on public.memberships;
create trigger set_memberships_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

drop trigger if exists set_community_rules_updated_at on public.community_rules;
create trigger set_community_rules_updated_at before update on public.community_rules
for each row execute function public.set_updated_at();

drop trigger if exists set_community_posts_updated_at on public.community_posts;
create trigger set_community_posts_updated_at before update on public.community_posts
for each row execute function public.set_updated_at();

drop trigger if exists set_community_post_comments_updated_at on public.community_post_comments;
create trigger set_community_post_comments_updated_at before update on public.community_post_comments
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_conversations_updated_at on public.chat_conversations;
create trigger set_chat_conversations_updated_at before update on public.chat_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_badges_updated_at on public.badges;
create trigger set_badges_updated_at
before update on public.badges
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.communities enable row level security;
alter table public.activities enable row level security;
alter table public.participants enable row level security;
alter table public.comments enable row level security;
alter table public.vibes enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.follows enable row level security;
alter table public.memberships enable row level security;
alter table public.community_rules enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_post_comments enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- Profiles
drop policy if exists "profiles read self or public" on public.profiles;
create policy "profiles read self or public"
on public.profiles
for select
to anon, authenticated
using ((select auth.uid()) = id or not is_private);

drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Interests and badges are public lookup tables
drop policy if exists "interests read all" on public.interests;
create policy "interests read all"
on public.interests
for select
to anon, authenticated
using (true);

drop policy if exists "profile interests read visible" on public.profile_interests;
create policy "profile interests read visible"
on public.profile_interests
for select
to anon, authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = profile_interests.profile_id and not p.is_private
  )
);

drop policy if exists "profile interests insert self" on public.profile_interests;
create policy "profile interests insert self"
on public.profile_interests
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "profile interests delete self" on public.profile_interests;
create policy "profile interests delete self"
on public.profile_interests
for delete
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "badges read all" on public.badges;
create policy "badges read all"
on public.badges
for select
to anon, authenticated
using (true);

-- Communities
drop policy if exists "communities read public or member" on public.communities;
create policy "communities read public or member"
on public.communities
for select
to anon, authenticated
using (
  not is_private
  or owner_id = (select auth.uid())
  or exists (
    select 1
    from public.memberships m
    where m.community_id = id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists "communities insert owner" on public.communities;
create policy "communities insert owner"
on public.communities
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "communities update owner" on public.communities;
create policy "communities update owner"
on public.communities
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "communities delete owner" on public.communities;
create policy "communities delete owner"
on public.communities
for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Activities
drop policy if exists "activities read public or related" on public.activities;
create policy "activities read public or related"
on public.activities
for select
to anon, authenticated
using (
  visibility = 'public'
  or owner_id = (select auth.uid())
  or exists (
    select 1
    from public.memberships m
    where m.community_id = activities.community_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists "activities insert owner" on public.activities;
create policy "activities insert owner"
on public.activities
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "activities update owner" on public.activities;
create policy "activities update owner"
on public.activities
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "activities delete owner" on public.activities;
create policy "activities delete owner"
on public.activities
for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Participants
drop policy if exists "participants read self or host" on public.participants;
create policy "participants read self or host"
on public.participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.activities a
    where a.id = participants.activity_id
      and a.owner_id = (select auth.uid())
  )
);

drop policy if exists "participants insert self" on public.participants;
create policy "participants insert self"
on public.participants
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "participants update self or host" on public.participants;
create policy "participants update self or host"
on public.participants
for update
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.activities a
    where a.id = participants.activity_id
      and a.owner_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.activities a
    where a.id = participants.activity_id
      and a.owner_id = (select auth.uid())
  )
);

drop policy if exists "participants delete self or host" on public.participants;
create policy "participants delete self or host"
on public.participants
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.activities a
    where a.id = participants.activity_id
      and a.owner_id = (select auth.uid())
  )
);

-- Comments
drop policy if exists "comments read related" on public.comments;
create policy "comments read related"
on public.comments
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.activities a
    where a.id = comments.activity_id
      and (
        a.visibility = 'public'
        or a.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.memberships m
          where m.community_id = a.community_id
            and m.user_id = (select auth.uid())
            and m.status = 'active'
        )
      )
  )
);

drop policy if exists "comments insert author" on public.comments;
create policy "comments insert author"
on public.comments
for insert
to authenticated
with check (author_id = (select auth.uid()));

drop policy if exists "comments update author" on public.comments;
create policy "comments update author"
on public.comments
for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

drop policy if exists "comments delete author" on public.comments;
create policy "comments delete author"
on public.comments
for delete
to authenticated
using (author_id = (select auth.uid()));

-- Vibes
drop policy if exists "vibes read related" on public.vibes;
create policy "vibes read related"
on public.vibes
for select
to anon, authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.activities a
    where a.id = vibes.activity_id
      and (
        a.visibility = 'public'
        or a.owner_id = (select auth.uid())
      )
  )
);

drop policy if exists "vibes insert self" on public.vibes;
create policy "vibes insert self"
on public.vibes
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "vibes update self" on public.vibes;
create policy "vibes update self"
on public.vibes
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "vibes delete self" on public.vibes;
create policy "vibes delete self"
on public.vibes
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Likes and saves
drop policy if exists "likes read self" on public.likes;
create policy "likes read self"
on public.likes
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "likes insert self" on public.likes;
create policy "likes insert self"
on public.likes
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "likes delete self" on public.likes;
create policy "likes delete self"
on public.likes
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "saves read self" on public.saves;
create policy "saves read self"
on public.saves
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "saves insert self" on public.saves;
create policy "saves insert self"
on public.saves
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "saves delete self" on public.saves;
create policy "saves delete self"
on public.saves
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Follows
drop policy if exists "follows read self" on public.follows;
create policy "follows read self"
on public.follows
for select
to authenticated
using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));

drop policy if exists "follows insert self" on public.follows;
create policy "follows insert self"
on public.follows
for insert
to authenticated
with check (follower_id = (select auth.uid()));

drop policy if exists "follows delete self" on public.follows;
create policy "follows delete self"
on public.follows
for delete
to authenticated
using (follower_id = (select auth.uid()));

-- Memberships
drop policy if exists "memberships read self or community" on public.memberships;
create policy "memberships read self or community"
on public.memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.communities c
    where c.id = memberships.community_id
      and c.owner_id = (select auth.uid())
  )
);

drop policy if exists "memberships insert self" on public.memberships;
create policy "memberships insert self"
on public.memberships
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "memberships update self or owner" on public.memberships;
create policy "memberships update self or owner"
on public.memberships
for update
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.communities c
    where c.id = memberships.community_id
      and c.owner_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.communities c
    where c.id = memberships.community_id
      and c.owner_id = (select auth.uid())
  )
);

drop policy if exists "memberships delete self or owner" on public.memberships;
create policy "memberships delete self or owner"
on public.memberships
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.communities c
    where c.id = memberships.community_id
      and c.owner_id = (select auth.uid())
  )
);

-- Community rules and feed content
drop policy if exists "community rules read visible" on public.community_rules;
create policy "community rules read visible" on public.community_rules for select to anon, authenticated
using (exists (select 1 from public.communities c where c.id = community_id and (not c.is_private or c.owner_id = (select auth.uid()) or exists (select 1 from public.memberships m where m.community_id = c.id and m.user_id = (select auth.uid()) and m.status = 'active'))));

drop policy if exists "community rules manage owner" on public.community_rules;
create policy "community rules manage owner" on public.community_rules for all to authenticated
using (exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())));

drop policy if exists "community posts read visible" on public.community_posts;
create policy "community posts read visible" on public.community_posts for select to anon, authenticated
using (status = 'published' and exists (select 1 from public.communities c where c.id = community_id and (not c.is_private or c.owner_id = (select auth.uid()) or exists (select 1 from public.memberships m where m.community_id = c.id and m.user_id = (select auth.uid()) and m.status = 'active'))));

drop policy if exists "community posts create member" on public.community_posts;
create policy "community posts create member" on public.community_posts for insert to authenticated
with check (author_id = (select auth.uid()) and exists (select 1 from public.communities c where c.id = community_id and (c.owner_id = (select auth.uid()) or exists (select 1 from public.memberships m where m.community_id = c.id and m.user_id = (select auth.uid()) and m.status = 'active'))));

drop policy if exists "community posts update author" on public.community_posts;
create policy "community posts update author" on public.community_posts for update to authenticated
using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

drop policy if exists "community posts delete author or owner" on public.community_posts;
create policy "community posts delete author or owner" on public.community_posts for delete to authenticated
using (author_id = (select auth.uid()) or exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())));

drop policy if exists "community reactions read visible" on public.community_post_reactions;
create policy "community reactions read visible" on public.community_post_reactions for select to anon, authenticated
using (exists (select 1 from public.community_posts p join public.communities c on c.id = p.community_id where p.id = post_id and p.status = 'published' and not c.is_private));

drop policy if exists "community reactions manage self" on public.community_post_reactions;
create policy "community reactions manage self" on public.community_post_reactions for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "community post comments read visible" on public.community_post_comments;
create policy "community post comments read visible" on public.community_post_comments for select to anon, authenticated
using (exists (select 1 from public.community_posts p join public.communities c on c.id = p.community_id where p.id = post_id and p.status = 'published' and not c.is_private));

drop policy if exists "community post comments create self" on public.community_post_comments;
create policy "community post comments create self" on public.community_post_comments for insert to authenticated
with check (author_id = (select auth.uid()));

drop policy if exists "community post comments manage self" on public.community_post_comments;
create policy "community post comments manage self" on public.community_post_comments for update to authenticated
using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

drop policy if exists "community post comments delete self" on public.community_post_comments;
create policy "community post comments delete self" on public.community_post_comments for delete to authenticated
using (author_id = (select auth.uid()));

-- Conversations, group membership, and realtime-ready messages
drop policy if exists "conversations read member" on public.chat_conversations;
create policy "conversations read member" on public.chat_conversations for select to authenticated
using (public.is_chat_member(id));

drop policy if exists "conversations create self" on public.chat_conversations;
create policy "conversations create self" on public.chat_conversations for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "conversations update admin" on public.chat_conversations;
create policy "conversations update admin" on public.chat_conversations for update to authenticated
using (public.is_chat_admin(id))
with check (public.is_chat_admin(id));

drop policy if exists "conversations delete owner" on public.chat_conversations;
create policy "conversations delete owner" on public.chat_conversations for delete to authenticated
using (created_by = (select auth.uid()));

drop policy if exists "chat members read participants" on public.chat_members;
create policy "chat members read participants" on public.chat_members for select to authenticated
using (public.is_chat_member(conversation_id));

drop policy if exists "chat members add self or owner" on public.chat_members;
create policy "chat members add self or owner" on public.chat_members for insert to authenticated
with check (user_id = (select auth.uid()) or public.is_chat_admin(conversation_id));

drop policy if exists "chat members update self or owner" on public.chat_members;
create policy "chat members update self or owner" on public.chat_members for update to authenticated
using (user_id = (select auth.uid()) or public.is_chat_admin(conversation_id))
with check (user_id = (select auth.uid()) or public.is_chat_admin(conversation_id));

drop policy if exists "chat members remove self or owner" on public.chat_members;
create policy "chat members remove self or owner" on public.chat_members for delete to authenticated
using (user_id = (select auth.uid()) or public.is_chat_admin(conversation_id));

drop policy if exists "messages read member" on public.chat_messages;
create policy "messages read member" on public.chat_messages for select to authenticated
using (public.is_chat_member(conversation_id));

drop policy if exists "messages create member" on public.chat_messages;
create policy "messages create member" on public.chat_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and public.is_chat_member(conversation_id));

drop policy if exists "messages update sender" on public.chat_messages;
create policy "messages update sender" on public.chat_messages for update to authenticated
using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

drop policy if exists "messages delete sender" on public.chat_messages;
create policy "messages delete sender" on public.chat_messages for delete to authenticated
using (sender_id = (select auth.uid()));

-- Stories are discoverable while active; owners control publishing and viewers own receipts.
drop policy if exists "stories read active" on public.stories;
create policy "stories read active" on public.stories for select to anon, authenticated
using (expires_at > now() and (visibility = 'public' or owner_id = (select auth.uid())));

drop policy if exists "stories create self" on public.stories;
create policy "stories create self" on public.stories for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "stories update self" on public.stories;
create policy "stories update self" on public.stories for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "stories delete self" on public.stories;
create policy "stories delete self" on public.stories for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "story views read self" on public.story_views;
create policy "story views read self" on public.story_views for select to authenticated
using (viewer_id = (select auth.uid()) or exists (select 1 from public.stories s where s.id = story_id and s.owner_id = (select auth.uid())));

drop policy if exists "story views create self" on public.story_views;
create policy "story views create self" on public.story_views for insert to authenticated
with check (viewer_id = (select auth.uid()));

drop policy if exists "story views delete self" on public.story_views;
create policy "story views delete self" on public.story_views for delete to authenticated
using (viewer_id = (select auth.uid()));

-- User badges
drop policy if exists "user badges read self" on public.user_badges;
create policy "user badges read self"
on public.user_badges
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "user badges insert owner" on public.user_badges;
create policy "user badges insert owner"
on public.user_badges
for insert
to authenticated
with check (awarded_by = (select auth.uid()));

drop policy if exists "user badges delete owner" on public.user_badges;
create policy "user badges delete owner"
on public.user_badges
for delete
to authenticated
using (awarded_by = (select auth.uid()) or user_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
revoke all on function public.is_chat_member(uuid, uuid) from public;
revoke all on function public.is_chat_admin(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid), public.is_chat_admin(uuid, uuid) to authenticated;
grant select on public.profiles, public.interests, public.profile_interests, public.communities,
  public.activities, public.participants, public.comments, public.vibes, public.badges,
  public.community_rules, public.community_posts, public.community_post_reactions,
  public.community_post_comments, public.stories to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
