-- The client specifies 100 qualifying participants, not only paid participants.
-- Payment validation remains mandatory for Cashfree activities; all existing
-- cancellation, removal, duplicate and suspended-account guards are preserved.
begin;
create or replace function private.badge_metrics(p_id integer) returns jsonb
language sql stable security definer set search_path='' as $$
 with valid_events as (
  select e.* from public.tbl_events e where (e.created_by=p_id or exists(
   select 1 from public.tbl_event_participants relevant where relevant.event_id=e.id and relevant.user_id=p_id))
   and not coalesce(e.is_deleted,false)
   and not coalesce(e.is_cancelled,false) and e.status not in ('draft','cancelled','deleted')
   and private.badge_valid_user(e.created_by)
   and not exists(select 1 from private.badge_disqualifications d where d.entity_type='event' and d.entity_id=e.id)
 ), participations as (
  select distinct p.event_id,p.user_id from public.tbl_event_participants p join valid_events e on e.id=p.event_id
  where p.status in ('approved','going','paid') and p.user_id<>e.created_by and private.badge_valid_user(p.user_id)
   and (e.payment_collection_mode is distinct from 'cashfree' or exists(
    select 1 from public.tbl_activity_payments pay where pay.event_id=e.id and pay.user_id=p.user_id
     and pay.status='paid' and coalesce(pay.financial_status,'OPEN') not in ('REFUND_REQUIRED','REFUNDED','REVERSED','DISPUTED')))
 ), referrals as (
  select distinct a.id,private.badge_referral_identity(a.email) as email,nullif(a.phone,'') as phone
  from public.tbl_referral_history r join public.tbl_users u on u.id=r.referred_user_id
   join auth.users a on a.id=u.auth_user_id join public.tbl_users inviter on inviter.id=r.referrer_id
   join auth.users ia on ia.id=inviter.auth_user_id
  where r.referrer_id=p_id and r.referred_user_id<>p_id and a.id<>ia.id and r.points_awarded>0
   and private.badge_valid_user(u.id) and (a.email_confirmed_at is not null or a.phone_confirmed_at is not null)
   and not exists(select 1 from private.badge_disqualifications d where d.entity_type='referral' and d.entity_id=r.id)
   and (nullif(a.email,'') is null or private.badge_referral_identity(a.email) is distinct from private.badge_referral_identity(ia.email))
   and (nullif(a.phone,'') is null or a.phone is distinct from ia.phone)
 ), unique_referrals as (
  select r.id from referrals r where not exists(select 1 from referrals earlier where earlier.id::text<r.id::text
    and ((nullif(r.email,'') is not null and r.email=earlier.email) or (r.phone is not null and r.phone=earlier.phone)))
 )
 select case when not private.badge_valid_user(p_id) then '{}'::jsonb else jsonb_build_object(
 'joined',(select count(*) from participations where user_id=p_id),
 'completed',(select count(*) from participations p join valid_events e on e.id=p.event_id where p.user_id=p_id and e.event_end_time<=now()),
 'hosted',(select count(*) from valid_events where created_by=p_id and event_end_time<=now()),
 'communities',(select count(distinct cp.room_id) from public.tbl_chat_participants cp join public.tbl_chat_rooms r on r.id=cp.room_id where cp.user_id=p_id and r.room_type='community' and private.badge_valid_user(r.created_by)),
 'posts',(select count(*) from public.tbl_community_posts p join public.tbl_chat_rooms r on r.id=p.room_id
   where p.user_id=p_id and p.deleted_at is null and r.room_type='community' and private.badge_valid_user(r.created_by)
   and not exists(select 1 from private.badge_disqualifications d where d.entity_type='post' and d.entity_id=p.id)),
 'referrals',(select count(*) from unique_referrals),
 'partner',(select count(*) from public.tbl_partner_profiles where user_id=p_id and status='APPROVED'),
 'partner_hosted',(select count(*) from valid_events e where e.created_by=p_id and e.event_end_time<=now() and e.payment_collection_mode='cashfree' and e.is_paid
   and exists(select 1 from public.tbl_partner_profiles pp where pp.user_id=p_id and pp.status='APPROVED')),
 'partner_participants',(select count(*) from participations p join valid_events e on e.id=p.event_id where e.created_by=p_id
   and exists(select 1 from public.tbl_partner_profiles pp where pp.user_id=p_id and pp.status='APPROVED'))
 ) end
$$;


update public.tbl_badges set description='Welcome 100 qualifying participants.' where slug='popular-partner';
notify pgrst,'reload schema';
commit;
