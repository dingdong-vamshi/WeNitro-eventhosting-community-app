-- Restore the client-accepted Nitro reward for rating an Activity participant.
-- The existing (user_id, rating_id) unique constraint makes retries and rating
-- edits idempotent: the host receives +2 exactly once for each rating record.

create or replace function public.rate_activity_participant(
  p_event_id integer,
  p_user_id integer,
  p_behaviour integer,
  p_friendly integer,
  p_communication integer,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  overall integer;
  row public.tbl_participant_ratings;
  reward_inserted boolean := false;
begin
  if not exists (
    select 1
    from public.tbl_events e
    where e.id = p_event_id
      and e.created_by = me
      and (e.status = 'completed' or e.event_end_time <= now())
  ) then
    raise exception 'Only the host can rate participants after the Activity ends'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.tbl_event_participants p
    where p.event_id = p_event_id
      and p.user_id = p_user_id
      and p.status in ('approved', 'no_show')
  ) then
    raise exception 'This member is not an approved participant';
  end if;

  if p_behaviour not between 1 and 5
    or p_friendly not between 1 and 5
    or p_communication not between 1 and 5 then
    raise exception 'Choose 1 to 5 stars for every rating';
  end if;

  if length(btrim(coalesce(p_comment, ''))) > 1000 then
    raise exception 'Feedback must be 1000 characters or fewer';
  end if;

  overall := round((p_behaviour + p_friendly + p_communication)::numeric / 3)::integer;

  insert into public.tbl_participant_ratings(
    event_id, rater_id, rated_user_id, overall_rating, behaviour_rating,
    friendly_rating, communication_rating, comment, is_no_show, updated_at
  ) values (
    p_event_id, me, p_user_id, overall, p_behaviour,
    p_friendly, p_communication, nullif(btrim(coalesce(p_comment, '')), ''),
    false, now()
  )
  on conflict(event_id, rater_id, rated_user_id) do update set
    overall_rating = excluded.overall_rating,
    behaviour_rating = excluded.behaviour_rating,
    friendly_rating = excluded.friendly_rating,
    communication_rating = excluded.communication_rating,
    comment = excluded.comment,
    is_no_show = false,
    updated_at = now()
  returning * into row;

  insert into public.tbl_user_points_history(
    user_id, rating_id, points_earned, verification_method
  ) values (
    me, row.id, 2, null
  )
  on conflict(user_id, rating_id) do nothing;
  reward_inserted := found;

  if reward_inserted then
    update public.tbl_users
    set points = coalesce(points, 0) + 2
    where id = me;
  end if;

  update public.tbl_users u
  set rating = (
    select round(avg(r.overall_rating)::numeric, 2)
    from public.tbl_participant_ratings r
    where r.rated_user_id = p_user_id
      and not coalesce(r.is_no_show, false)
  )
  where u.id = p_user_id;

  return jsonb_build_object(
    'id', row.id,
    'rated_user_id', row.rated_user_id,
    'behaviour_rating', row.behaviour_rating,
    'friendly_rating', row.friendly_rating,
    'communication_rating', row.communication_rating,
    'overall_rating', row.overall_rating,
    'comment', coalesce(row.comment, ''),
    'updated_at', row.updated_at,
    'points_awarded', case when reward_inserted then 2 else 0 end
  );
end;
$$;

revoke all on function public.rate_activity_participant(
  integer, integer, integer, integer, integer, text
) from public, anon;

grant execute on function public.rate_activity_participant(
  integer, integer, integer, integer, integer, text
) to authenticated;
