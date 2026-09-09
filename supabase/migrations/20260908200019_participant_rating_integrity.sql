-- Prevent any rating path from allowing a member to rate themselves.
-- The host-only RPC already controls who may create or edit a rating; this
-- table constraint keeps the same invariant for future write paths.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tbl_participant_ratings'::regclass
      and conname = 'tbl_participant_ratings_no_self_rating'
  ) then
    alter table public.tbl_participant_ratings
      add constraint tbl_participant_ratings_no_self_rating
      check (rater_id <> rated_user_id);
  end if;
end
$$;
