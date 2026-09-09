-- Keep social discovery and engagement screens current without polling.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'activities',
    'participants',
    'comments',
    'vibes',
    'likes',
    'saves',
    'memberships',
    'community_post_comments',
    'community_post_reactions'
  ] loop
    begin
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
