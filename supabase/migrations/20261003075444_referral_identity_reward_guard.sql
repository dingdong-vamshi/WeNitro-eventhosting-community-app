-- A confirmed person can generate one referral reward, including aliases of an
-- identity already rewarded. Use the same Gmail normalization as badge counts.
create or replace function public.redeem_referral(p_referrer_id integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); created_id integer;
 member_auth auth.users; inviter_auth auth.users; member_email text; member_phone text;
begin
 if p_referrer_id is null or p_referrer_id=me then raise exception 'Referral is invalid';end if;
 if not private.badge_valid_user(me) or not private.badge_valid_user(p_referrer_id) then
  raise exception 'Inviter or member is unavailable' using errcode='42501';
 end if;
 select a.* into member_auth from auth.users a join public.tbl_users u on u.auth_user_id=a.id where u.id=me;
 select a.* into inviter_auth from auth.users a join public.tbl_users u on u.auth_user_id=a.id where u.id=p_referrer_id;
 if member_auth.id is null or inviter_auth.id is null or
    (member_auth.email_confirmed_at is null and member_auth.phone_confirmed_at is null) then
  raise exception 'Confirm your email or phone before accepting an invitation' using errcode='42501';
 end if;
 member_email:=nullif(private.badge_referral_identity(member_auth.email),'');
 member_phone:=nullif(member_auth.phone,'');
 if member_auth.id=inviter_auth.id
  or (member_email is not null and member_email=private.badge_referral_identity(inviter_auth.email))
  or (member_phone is not null and member_phone=inviter_auth.phone) then
  raise exception 'You cannot refer your own account';
 end if;
 -- Referrals are infrequent; one transaction lock also covers simultaneous
 -- redemption by two aliases with different profile IDs.
 perform pg_advisory_xact_lock(hashtext('wenitro:referral:identity-award'));
 if exists(select 1 from public.tbl_referral_history r
  join public.tbl_users u on u.id=r.referred_user_id join auth.users a on a.id=u.auth_user_id
  where r.referred_user_id=me or (r.points_awarded>0 and (
    (member_email is not null and member_email=private.badge_referral_identity(a.email))
    or (member_phone is not null and member_phone=a.phone)))) then
  return jsonb_build_object('awarded',false,'points',0);
 end if;
 insert into public.tbl_referral_history(referrer_id,referred_user_id,points_awarded)
 values(p_referrer_id,me,10) on conflict(referred_user_id) do nothing returning id into created_id;
 if created_id is not null then update public.tbl_users set points=coalesce(points,0)+10 where id=p_referrer_id;end if;
 return jsonb_build_object('awarded',created_id is not null,'points',case when created_id is null then 0 else 10 end);
end $$;
revoke all on function public.redeem_referral(integer) from public,anon;
grant execute on function public.redeem_referral(integer) to authenticated;

-- Referrals already have an authoritative ledger. Include it in history rather
-- than duplicating old rewards or touching previously credited balances.
create or replace function public.list_my_nitro_history()
returns jsonb language sql stable security definer set search_path='' as $$
 with me as (select public.get_current_app_user_id() id), all_entries as (
  select h.id::bigint,h.points_earned,h.created_at,h.verification_method,r.event_id,e.title
  from public.tbl_user_points_history h join me on me.id=h.user_id
  left join public.tbl_participant_ratings r on r.id=h.rating_id
  left join public.tbl_events e on e.id=r.event_id
  union all
  select -r.id::bigint,r.points_awarded,r.created_at,'referral',null::integer,null::text
  from public.tbl_referral_history r join me on me.id=r.referrer_id where r.points_awarded<>0
 ), entries as (select * from all_entries order by created_at desc,id desc limit 100)
 select jsonb_build_object(
  'balance',(select coalesce(u.points,0) from public.tbl_users u join me on me.id=u.id),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'points',points_earned,'created_at',created_at,'event_id',event_id,
   'description',case verification_method
    when 'referral' then 'Successful referral'
    when 'email' then 'Email verification'
    when 'phone' then 'Phone verification'
    when 'live_photo' then 'Live Photo verification'
    when 'play_store_rating' then 'Play Store rating reward'
    else case when verification_method like 'spend:%' then 'Nitro Points spent · '||substring(verification_method from 7)
     when title is null then 'Activity participation rating' else 'Rating for '||title end end
  ) order by created_at desc,id desc) from entries),'[]'::jsonb))
$$;
