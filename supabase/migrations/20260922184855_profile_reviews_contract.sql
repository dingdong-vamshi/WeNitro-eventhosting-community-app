create or replace function public.profile_reviews(p_user_id integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(review_row) order by review_row.created_at desc,review_row.id desc),'[]'::jsonb)
  into result
  from (
    select r.id,r.overall_rating as rating,r.comment,r.created_at,e.title as event_title,
      u.id as rater_id,u.username as rater_username,u.fullname as rater_name,u.profile_image as rater_avatar
    from public.tbl_participant_ratings r
    join public.tbl_events e on e.id=r.event_id
    join public.tbl_users u on u.id=r.rater_id and u.is_active=1 and coalesce(u.is_delete,0)=0
    where r.rated_user_id=p_user_id and not coalesce(r.is_no_show,false)
    order by r.created_at desc,r.id desc
    limit 50
  ) review_row;
  return result;
end
$$;

revoke all on function public.profile_reviews(integer) from public,anon,authenticated;
grant execute on function public.profile_reviews(integer) to authenticated;
