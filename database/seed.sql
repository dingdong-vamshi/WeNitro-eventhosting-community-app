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

insert into public.badges (slug, name, description, icon)
values
  ('early-bird', 'Early Bird', 'Joined an activity early.', 'sunrise'),
  ('social-butterfly', 'Social Butterfly', 'Made meaningful new connections.', 'heart'),
  ('super-host', 'Super Host', 'Hosted five or more activities.', 'crown'),
  ('vibe-creator', 'Vibe Creator', 'Posted ten or more vibes.', 'sparkles'),
  ('weekend-warrior', 'Weekend Warrior', 'Stayed active across ten weekends.', 'zap'),
  ('trusted', 'Trusted', 'Reached a high community trust score.', 'shield-check')
on conflict (slug) do nothing;
