insert into public.interests (slug, name, icon)
values
  ('photography', 'Photography', 'camera'),
  ('badminton', 'Badminton', 'tennis-ball'),
  ('fitness', 'Fitness', 'dumbbell'),
  ('travel', 'Travel', 'map-pinned'),
  ('reading', 'Reading', 'book-open'),
  ('coffee', 'Coffee', 'coffee'),
  ('food', 'Food', 'utensils-crossed'),
  ('music', 'Music', 'music'),
  ('design', 'Design', 'pen-tool'),
  ('startup', 'Startup', 'sparkles'),
  ('wellness', 'Wellness', 'heart-pulse')
on conflict (slug) do nothing;

-- Community demo data is inserted when at least one profile already exists.
-- This keeps the dump compatible with fresh Supabase projects where auth users
-- are created after the schema is applied.
do $$
declare
  demo_owner uuid;
  explorer_id uuid;
  badminton_id uuid;
begin
  select id into demo_owner from public.profiles order by created_at limit 1;
  if demo_owner is null then return; end if;

  insert into public.communities (owner_id, name, slug, tagline, description, category, image_url, cover_url, tags, is_verified)
  values (demo_owner, 'Bhubaneswar Explorers', 'bhubaneswar-explorers', 'Explore. Connect. Experience.', 'A local space for travel, outdoor plans, and shared discoveries.', 'Travel', '/assets/photos/cycling.jpg', '/assets/photos/camera.jpg', array['Travel','Outdoors','Adventure'], true)
  on conflict (slug) do update set tagline = excluded.tagline
  returning id into explorer_id;

  insert into public.communities (owner_id, name, slug, tagline, description, category, image_url, cover_url, tags)
  values (demo_owner, 'Badminton Bhubaneswar', 'badminton-bhubaneswar', 'Smash together. Win together.', 'Find players, book courts, and keep the game moving.', 'Sports', '/assets/photos/sport.jpg', '/assets/photos/sport.jpg', array['Sports','Badminton','Fitness'])
  on conflict (slug) do update set tagline = excluded.tagline
  returning id into badminton_id;

  insert into public.memberships (community_id, user_id, role, status)
  values (explorer_id, demo_owner, 'admin', 'active'), (badminton_id, demo_owner, 'member', 'active')
  on conflict (community_id, user_id) do update set status = 'active';

  insert into public.community_rules (community_id, position, body)
  values (explorer_id, 1, 'Be respectful to others'), (explorer_id, 2, 'No spam or self-promotion'), (explorer_id, 3, 'Keep content relevant to the community')
  on conflict (community_id, position) do update set body = excluded.body;

  insert into public.community_posts (community_id, author_id, title, body, category, media_url, media_type)
  select explorer_id, demo_owner, 'Sunset in Goa never gets old', 'Calming waves, orange skies and good company.', 'Travel', '/assets/photos/ride.jpg', 'image'
  where not exists (select 1 from public.community_posts where community_id = explorer_id and title = 'Sunset in Goa never gets old');
end $$;

insert into public.badges (slug, name, description, icon)
values
  ('early-bird', 'Early Bird', 'Joined an activity early.', 'sunrise'),
  ('social-butterfly', 'Social Butterfly', 'Made meaningful new connections.', 'heart'),
  ('super-host', 'Super Host', 'Hosted five or more activities.', 'crown'),
  ('vibe-creator', 'Vibe Creator', 'Posted ten or more vibes.', 'sparkles'),
  ('weekend-warrior', 'Weekend Warrior', 'Stayed active across ten weekends.', 'zap'),
  ('trusted', 'Trusted', 'Reached a high community trust score.', 'shield-check')
on conflict (slug) do nothing;
