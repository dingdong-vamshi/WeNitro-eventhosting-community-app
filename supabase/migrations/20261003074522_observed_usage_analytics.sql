-- First-party coarse daily usage; no location, IP address, advertising ID or device fingerprint.
create table private.app_daily_activity(user_id integer not null references public.tbl_users(id),day date not null,platform text not null check(platform in ('web','ios','android','other')),primary key(user_id,day,platform));
create table private.activity_daily_views(user_id integer not null references public.tbl_users(id),event_id integer not null references public.tbl_events(id),day date not null,primary key(user_id,event_id,day));
alter table private.app_daily_activity enable row level security;
alter table private.activity_daily_views enable row level security;
revoke all on private.app_daily_activity,private.activity_daily_views from public,anon,authenticated;
create index app_daily_activity_day on private.app_daily_activity(day,user_id);
create index activity_daily_views_day on private.activity_daily_views(day,event_id);
create function private.record_usage(p_platform text,p_event_id integer) returns void language plpgsql security definer set search_path='' as $$
declare me integer:=public.current_app_user_id();today date:=(now() at time zone 'UTC')::date;
begin
 if me is null or auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_platform is null or p_platform not in ('web','ios','android','other') then raise exception 'Invalid platform';end if;
 if p_event_id is not null and not exists(select 1 from public.tbl_events e where e.id=p_event_id and not coalesce(e.is_deleted,false) and ((e.status='published' and e.visibility_type='public') or e.created_by=me or public.is_event_participant(e.id))) then raise exception 'Activity unavailable' using errcode='42501';end if;
 insert into private.app_daily_activity values(me,today,p_platform) on conflict do nothing;
 if p_event_id is not null then insert into private.activity_daily_views values(me,p_event_id,today) on conflict do nothing;end if;
end $$;
create function public.record_app_usage(p_platform text,p_event_id integer default null) returns void language sql security invoker set search_path='' as $$select private.record_usage(p_platform,p_event_id)$$;
revoke all on function private.record_usage(text,integer),public.record_app_usage(text,integer) from public,anon;
grant execute on function private.record_usage(text,integer),public.record_app_usage(text,integer) to authenticated;

create function private.usage_return_rate(p_days integer) returns numeric language sql stable security definer set search_path='' as $$
 with prior_users as(select distinct user_id from private.app_daily_activity where day>=(now() at time zone 'UTC')::date-2*p_days+1 and day<=(now() at time zone 'UTC')::date-p_days),current_users as(select distinct user_id from private.app_daily_activity where day>(now() at time zone 'UTC')::date-p_days)
 select case when count(*)=0 then null else round(100.0*count(*) filter(where user_id in(select user_id from current_users))/count(*),1) end from prior_users
$$;
revoke all on function private.usage_return_rate(integer) from public,anon,authenticated;
create function private.admin_usage_metrics(p_days integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'UTC')::date;days integer:=least(greatest(coalesce(p_days,30),1),365);since date;
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 select min(day) into since from private.app_daily_activity;
 return jsonb_build_object('since',since,'timezone','UTC','dau',(select count(distinct user_id) from private.app_daily_activity where day=today),
 'mau',(select count(distinct user_id) from private.app_daily_activity where day>today-30),
 'retention',jsonb_build_object('week',private.usage_return_rate(7),'month',private.usage_return_rate(30),'quarter',private.usage_return_rate(90)),
 'platforms',(select coalesce(jsonb_agg(x),'[]') from(select platform,count(*) visits from private.app_daily_activity where day>today-days group by platform)x),
 'daily',(select coalesce(jsonb_agg(x order by x.day),'[]') from(select day,count(distinct user_id) users from private.app_daily_activity where day>today-days group by day)x),
 'views',(select coalesce(jsonb_agg(x order by x.day),'[]') from(select day,event_id,count(*) views from private.activity_daily_views where day>today-days group by day,event_id)x));
end $$;
create function public.admin_usage_metrics(p_days integer default 30) returns jsonb language sql security invoker set search_path='' as $$select private.admin_usage_metrics(p_days)$$;
revoke all on function private.admin_usage_metrics(integer),public.admin_usage_metrics(integer) from public,anon;
grant execute on function private.admin_usage_metrics(integer),public.admin_usage_metrics(integer) to authenticated;
