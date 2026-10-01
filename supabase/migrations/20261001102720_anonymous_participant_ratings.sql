-- Anonymity is a per-rating choice. Existing reviews remain named.
alter table public.tbl_participant_ratings
  add column if not exists is_anonymous boolean not null default false;

-- Keep the existing eligibility and one-time Nitro reward rules. This overload
-- is used only by the new client; the older RPC remains available to old builds.
create or replace function private.save_participant_rating(
  p_event_id integer,p_user_id integer,p_behaviour integer,p_friendly integer,
  p_communication integer,p_comment text,p_no_show boolean,p_is_anonymous boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); host_id integer;
  r public.tbl_participant_ratings; awarded boolean;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select created_by into host_id from public.tbl_events where id=p_event_id
    and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false)
    and (status='completed' or event_end_time<=now());
  if host_id is null then raise exception 'Ratings open after the Activity ends' using errcode='42501'; end if;
  if me<>host_id and not exists(select 1 from public.tbl_event_participants
    where event_id=p_event_id and user_id=me and status in ('approved','going','paid'))
  then raise exception 'Only joined participants can rate' using errcode='42501'; end if;
  if me=p_user_id then raise exception 'You cannot rate yourself' using errcode='42501'; end if;
  if p_user_id<>host_id and not exists(select 1 from public.tbl_event_participants
    where event_id=p_event_id and user_id=p_user_id and status in ('approved','going','paid','no_show'))
  then raise exception 'Choose an Activity participant' using errcode='42501'; end if;
  if p_no_show and p_user_id=host_id then raise exception 'The Host cannot be marked No Show' using errcode='42501'; end if;
  if not p_no_show and (p_behaviour is null or p_behaviour not between 1 and 5
    or p_friendly is null or p_friendly not between 1 and 5
    or p_communication is null or p_communication not between 1 and 5)
  then raise exception 'Choose 1 to 5 stars for every rating'; end if;
  if length(btrim(coalesce(p_comment,'')))>1000 then raise exception 'Feedback must be 1000 characters or fewer'; end if;
  if p_is_anonymous is null then raise exception 'Choose whether this rating is anonymous'; end if;
  insert into public.tbl_participant_ratings(event_id,rater_id,rated_user_id,overall_rating,
    behaviour_rating,friendly_rating,communication_rating,comment,is_no_show,is_anonymous,updated_at)
  values(p_event_id,me,p_user_id,case when p_no_show then null else round((p_behaviour+p_friendly+p_communication)::numeric/3)::integer end,
    case when p_no_show then null else p_behaviour end,case when p_no_show then null else p_friendly end,
    case when p_no_show then null else p_communication end,nullif(btrim(coalesce(p_comment,'')),''),p_no_show,
    case when p_no_show then false else p_is_anonymous end,now())
  on conflict(event_id,rater_id,rated_user_id) do update set overall_rating=excluded.overall_rating,
    behaviour_rating=excluded.behaviour_rating,friendly_rating=excluded.friendly_rating,
    communication_rating=excluded.communication_rating,comment=excluded.comment,
    is_no_show=excluded.is_no_show,is_anonymous=excluded.is_anonymous,updated_at=now() returning * into r;
  insert into public.tbl_user_points_history(user_id,rating_id,points_earned,verification_method)
    values(me,r.id,2,null) on conflict(user_id,rating_id) do nothing;
  awarded:=found;
  if awarded then update public.tbl_users set points=coalesce(points,0)+2 where id=me; end if;
  update public.tbl_users set rating=coalesce((select round(avg(overall_rating)::numeric,2)
    from public.tbl_participant_ratings where rated_user_id=p_user_id and not coalesce(is_no_show,false)),0)
    where id=p_user_id;
  return to_jsonb(r)||jsonb_build_object('points_awarded',case when awarded then 2 else 0 end);
end $$;
revoke all on function private.save_participant_rating(integer,integer,integer,integer,integer,text,boolean,boolean) from public,anon,authenticated;

create or replace function public.rate_activity_participant(p_event_id integer,p_user_id integer,
  p_behaviour integer,p_friendly integer,p_communication integer,p_comment text,p_is_anonymous boolean)
returns jsonb language sql security definer set search_path='' as $$
  select private.save_participant_rating(p_event_id,p_user_id,p_behaviour,p_friendly,p_communication,p_comment,false,p_is_anonymous);
$$;
revoke all on function public.rate_activity_participant(integer,integer,integer,integer,integer,text,boolean) from public,anon;
grant execute on function public.rate_activity_participant(integer,integer,integer,integer,integer,text,boolean) to authenticated;

-- The normal profile endpoint must never include an anonymous rater's profile
-- ID, name, avatar or event title. Moderators retain the private table record.
create or replace function public.profile_reviews(p_user_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object('id',review_row.id,'rating',review_row.rating,
      'comment',review_row.comment,'is_anonymous',review_row.is_anonymous)
    || case when review_row.is_anonymous then '{}'::jsonb else
      jsonb_build_object('created_at',review_row.created_at,
        'event_title',review_row.event_title,'rater_id',review_row.rater_id,
        'rater_username',review_row.rater_username,'rater_name',review_row.rater_name,
        'rater_avatar',review_row.rater_avatar) end
    order by review_row.created_at desc,review_row.id desc),'[]'::jsonb)
  into result
  from (
    select r.id,r.overall_rating as rating,r.comment,r.created_at,r.is_anonymous,
      e.title as event_title,u.id as rater_id,u.username as rater_username,
      u.fullname as rater_name,u.profile_image as rater_avatar
    from public.tbl_participant_ratings r
    join public.tbl_events e on e.id=r.event_id
    join public.tbl_users u on u.id=r.rater_id and u.is_active=1 and coalesce(u.is_delete,0)=0
    where r.rated_user_id=p_user_id and not coalesce(r.is_no_show,false)
    order by r.created_at desc,r.id desc
    limit 50
  ) review_row;
  return result;
end $$;
revoke all on function public.profile_reviews(integer) from public,anon,authenticated;
grant execute on function public.profile_reviews(integer) to authenticated;
