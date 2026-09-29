alter table public.tbl_user_points_history
  drop constraint if exists verification_reward_valid;

alter table public.tbl_user_points_history
  add constraint verification_reward_valid check (
    (verification_method is null and rating_id is not null)
    or (
      verification_method in ('email', 'phone', 'live_photo', 'play_store_rating')
      and rating_id is null
      and points_earned = 10
    )
    or (
      verification_method like 'spend:%'
      and rating_id is null
      and points_earned < 0
    )
  );
