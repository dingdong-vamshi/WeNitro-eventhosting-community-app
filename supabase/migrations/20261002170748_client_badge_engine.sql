-- Client's 22 achievement rules. Existing verification badges and award keys remain intact.
alter table public.tbl_badges add column if not exists category text,
  add column if not exists metric text, add column if not exists threshold integer,
  add column if not exists display_order integer;
alter table public.tbl_user_badges add column if not exists criteria_snapshot jsonb,
  add column if not exists revoked_at timestamptz;

insert into public.tbl_badges(slug,name,description,icon,category,metric,threshold,display_order) values
('activity-explorer','Activity Explorer','Join 1 qualifying activity.','🧭','Explorer','joined',1,1),
('active-explorer','Active Explorer','Join 5 qualifying activities.','🗺️','Explorer','joined',5,2),
('adventure-seeker','Adventure Seeker','Join 10 qualifying activities.','🌍','Explorer','joined',10,3),
('activity-pro','Activity Pro','Join 25 qualifying activities.','🏆','Explorer','joined',25,4),
('first-time-host','First-Time Host','Complete 1 hosted activity.','🎤','Host','hosted',1,5),
('active-host','Active Host','Complete 5 hosted activities.','⭐','Host','hosted',5,6),
('experienced-host','Experienced Host','Complete 10 hosted activities.','🏆','Host','hosted',10,7),
('hosting-veteran','Hosting Veteran','Complete 25 hosted activities.','👑','Host','hosted',25,8),
('community-starter','Community Starter','Join 1 community.','💬','Community','communities',1,9),
('community-contributor','Community Contributor','Publish 5 qualifying community posts.','🗣️','Community','posts',5,10),
('conversation-starter','Conversation Starter','Publish 10 qualifying community posts.','💡','Community','posts',10,11),
('community-explorer','Community Explorer','Join 5 communities.','🌐','Community','communities',5,12),
('first-connector','First Connector','Invite 1 successfully referred member.','🫂','Connector','referrals',1,13),
('network-builder','Network Builder','Invite 5 successfully referred members.','🔗','Connector','referrals',5,14),
('community-connector','Community Connector','Invite 10 successfully referred members.','🌟','Connector','referrals',10,15),
('first-activity','First Activity','Complete your first participation.','🎯','Milestone','completed',1,16),
('10-activities','10 Activities','Complete 10 participations.','🎯','Milestone','completed',10,17),
('25-activities','25 Activities','Complete 25 participations.','🎯','Milestone','completed',25,18),
('50-activities','50 Activities','Complete 50 participations.','🎯','Milestone','completed',50,19),
('verified-partner','Verified Partner','Receive Admin approval as a Partner.','🏢','Partner','partner',1,20),
('active-partner','Active Partner','Complete 5 paid Partner activities.','🎯','Partner','partner_hosted',5,21),
('popular-partner','Popular Partner','Welcome 100 qualifying paid participants.','👥','Partner','partner_participants',100,22)
on conflict(slug) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,
 category=excluded.category,metric=excluded.metric,threshold=excluded.threshold,display_order=excluded.display_order;

-- Audit snapshots and anti-abuse overrides are never exposed by the client RPC.
create table private.badge_disqualifications (
 entity_type text not null check(entity_type in ('user','event','post','referral')),
 entity_id bigint not null, reason text not null check(length(btrim(reason))>0),
 recorded_at timestamptz not null default now(), primary key(entity_type,entity_id)
);
alter table private.badge_disqualifications enable row level security;
revoke all on private.badge_disqualifications from public,anon,authenticated;
grant all on private.badge_disqualifications to service_role;

create function private.badge_valid_user(p_id integer) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tbl_users u where u.id=p_id and u.is_active=1
 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null
 and not exists(select 1 from private.badge_disqualifications d where d.entity_type='user' and d.entity_id=u.id))
$$;
create function private.badge_referral_identity(p_email text) returns text
language sql immutable set search_path='' as $$
 select case when split_part(lower(btrim(p_email)),'@',2) in ('gmail.com','googlemail.com')
 then replace(split_part(split_part(lower(btrim(p_email)),'@',1),'+',1),'.','')||'@gmail.com'
 else lower(btrim(p_email)) end
$$;
create function private.badge_metrics(p_id integer) returns jsonb
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
 'partner_participants',(select count(*) from participations p join valid_events e on e.id=p.event_id where e.created_by=p_id and e.payment_collection_mode='cashfree' and e.is_paid
   and exists(select 1 from public.tbl_partner_profiles pp where pp.user_id=p_id and pp.status='APPROVED'))
 ) end
$$;

-- A single safe reconciliation on profile load handles both domain changes and clock-based completion.
-- No all-user scan, polling loop, client-supplied metric, or scattered screen award logic.
create function private.reconcile_client_badges(p_id integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare metrics jsonb;
begin
 perform pg_advisory_xact_lock(221022,p_id);
 metrics:=private.badge_metrics(p_id);
 insert into public.tbl_user_badges(user_id,badge_id,awarded_at,criteria_snapshot)
 select p_id,b.id,now(),jsonb_build_object('version',1,'metric',b.metric,'threshold',b.threshold,'observed',coalesce((metrics->>b.metric)::integer,0),'evaluated_at',now())
 from public.tbl_badges b where b.metric is not null and coalesce((metrics->>b.metric)::integer,0)>=b.threshold
 on conflict(user_id,badge_id) do update set revoked_at=null where tbl_user_badges.revoked_at is not null;
 update public.tbl_user_badges ub set revoked_at=now() from public.tbl_badges b
 where ub.user_id=p_id and ub.badge_id=b.id and b.metric is not null and ub.revoked_at is null
  and coalesce((metrics->>b.metric)::integer,0)<b.threshold;
 return metrics;
end $$;
create function private.profile_achievements(p_user_id integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare metrics jsonb; result jsonb; me integer:=public.get_current_app_user_id();
begin
 if auth.uid() is null or me is null or not private.badge_valid_user(me) then raise exception 'Authentication required' using errcode='42501'; end if;
 if not private.can_read_profile(p_user_id) or not private.badge_valid_user(p_user_id) then raise exception 'Profile unavailable' using errcode='42501'; end if;
 metrics:=private.reconcile_client_badges(p_user_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'slug',b.slug,'name',b.name,'description',b.description,'icon',b.icon,'category',b.category,
  'threshold',b.threshold,'progress',case when me=p_user_id then least(b.threshold,coalesce((metrics->>b.metric)::integer,0)) end,
  'earned_at',case when ub.revoked_at is null then ub.awarded_at end) order by b.display_order),'[]'::jsonb)
 into result from public.tbl_badges b left join public.tbl_user_badges ub on ub.badge_id=b.id and ub.user_id=p_user_id where b.metric is not null;
 return result;
end $$;
create function public.profile_achievements(p_user_id integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.profile_achievements(p_user_id) $$;
revoke all on function private.badge_valid_user(integer),private.badge_referral_identity(text),private.badge_metrics(integer),private.reconcile_client_badges(integer) from public,anon,authenticated;
revoke all on function private.profile_achievements(integer),public.profile_achievements(integer) from public,anon;
grant execute on function private.profile_achievements(integer),public.profile_achievements(integer) to authenticated;
-- Preserve legacy joins, but never expose private criteria snapshots or allow self-awards.
revoke all on public.tbl_user_badges from public,anon,authenticated;
grant select(user_id,badge_id,awarded_at,awarded_by,revoked_at) on public.tbl_user_badges to authenticated;
revoke insert,update,delete on public.tbl_badges from public,anon,authenticated;
alter policy user_badges_read on public.tbl_user_badges using (revoked_at is null and private.can_read_profile(user_id));
create or replace function public.list_my_badges() returns setof jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(b)||jsonb_build_object('awarded_at',ub.awarded_at,'awarded_by',ub.awarded_by)
 from public.tbl_user_badges ub join public.tbl_badges b on b.id=ub.badge_id
 where auth.uid() is not null and ub.user_id=public.get_current_app_user_id() and ub.revoked_at is null
 order by ub.awarded_at desc,b.id
$$;
revoke all on function public.list_my_badges() from public,anon;
grant execute on function public.list_my_badges() to authenticated;
notify pgrst,'reload schema';
