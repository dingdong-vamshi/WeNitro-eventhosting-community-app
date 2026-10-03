-- Make existing moderation controls persistent, auditable and reversible.
create table private.admin_operation_audit(
 id bigint generated always as identity primary key,actor_id uuid not null,
 target_type text not null,target_id bigint not null,action text not null,reason text not null,
 previous_state jsonb not null default '{}',next_state jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table private.admin_operation_audit enable row level security;
revoke all on private.admin_operation_audit from public,anon,authenticated;

create function private.account_is_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from auth.users where id=auth.uid() and banned_until>now())
$$;
revoke all on function private.account_is_allowed() from public,anon;
grant execute on function private.account_is_allowed() to authenticated;
create or replace function public.current_app_user_id() returns integer language sql stable security definer set search_path='' as $$
 select id from public.tbl_users where auth_user_id=auth.uid() and deactivated_at is null and private.account_is_allowed() limit 1
$$;
-- Apply the same suspension decision to direct table and Storage reads/writes,
-- including an access token issued before the suspension.
do $$ declare r record;begin
 for r in select schemaname,tablename from pg_tables where schemaname='public' and rowsecurity loop
  execute format('create policy admin_suspension_guard on %I.%I as restrictive for all to authenticated using ((select private.account_is_allowed())) with check ((select private.account_is_allowed()))',r.schemaname,r.tablename);
 end loop;
end $$;
create policy admin_suspension_guard on storage.objects as restrictive for all to authenticated
 using ((select private.account_is_allowed())) with check ((select private.account_is_allowed()));
create or replace function private.badge_valid_user(p_id integer) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tbl_users u where u.id=p_id and u.is_active=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null
 and not exists(select 1 from auth.users a where a.id=u.auth_user_id and a.banned_until>now())
 and not exists(select 1 from private.badge_disqualifications d where d.entity_type='user' and d.entity_id=u.id))
$$;
create function public.admin_moderate_user(p_user_id integer,p_duration text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.tbl_users%rowtype; previous_until timestamptz; next_until timestamptz; target_role text;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_duration is null or p_duration not in ('permanent','30d','90d','restore') then raise exception 'Invalid duration';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A moderation reason of 5–1000 characters is required';end if;
 select * into target from public.tbl_users where id=p_user_id for update;
 if not found or target.auth_user_id is null then raise exception 'Registered account unavailable';end if;
 if target.auth_user_id=auth.uid() then raise exception 'You cannot suspend your own account';end if;
 select banned_until,raw_app_meta_data->>'role' into previous_until,target_role from auth.users where id=target.auth_user_id for update;
 if target_role in ('super_admin','admin','finance_admin') then raise exception 'Manage administrator access through the Master account controls';end if;
 next_until:=case p_duration when 'permanent' then now()+interval '100 years' when '30d' then now()+interval '30 days' when '90d' then now()+interval '90 days' else null end;
 update auth.users set banned_until=next_until,updated_at=now() where id=target.auth_user_id;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
 values(auth.uid(),'user',p_user_id,p_duration,btrim(p_reason),jsonb_build_object('banned_until',previous_until),jsonb_build_object('banned_until',next_until));
 return jsonb_build_object('id',p_user_id,'banned_until',next_until,'restricted',next_until is not null);
end $$;

create or replace function public.admin_list_users() returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_wenitro_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 return query select jsonb_build_object('id',u.id,'account_type',u.account_type,'fullname',u.fullname,'username',u.username,'email',u.email,
 'profile_image',u.profile_image,'nationality',u.nationality,'countrycode',u.countrycode,'phonenumber',u.phonenumber,'create_at',u.create_at,
 'is_active',u.is_active,'is_delete',u.is_delete,'isverified',u.isverified,'rating',u.rating,'points',u.points,
 'banned_until',a.banned_until,'is_admin_restricted',coalesce(a.banned_until>now(),false))
 from public.tbl_users u left join auth.users a on a.id=u.auth_user_id order by u.id desc;
end $$;

create function public.admin_moderate_activity(p_event_id integer,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.tbl_events%rowtype; old_state jsonb; count_sent integer:=0;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_action is null or p_action not in ('warn_host','cancel_event','suspend_host','delete_event','restore_event','notify_participants') then raise exception 'Invalid moderation action';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A reason or message of 5–1000 characters is required';end if;
 select * into e from public.tbl_events where id=p_event_id for update;
 if not found then raise exception 'Activity unavailable';end if;
 if (p_action='cancel_event' and coalesce(e.is_cancelled,false)) or (p_action='delete_event' and coalesce(e.is_deleted,false)) or (p_action='restore_event' and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false)) then return jsonb_build_object('id',e.id,'changed',false,'notifications',0);end if;
 old_state:=jsonb_build_object('is_deleted',e.is_deleted,'is_cancelled',e.is_cancelled,'status',e.status);
 if p_action='suspend_host' then perform public.admin_moderate_user(e.created_by,'30d',p_reason);
 elsif p_action='cancel_event' then update public.tbl_events set is_cancelled=true,is_admin_pinned=false,updated_at=now() where id=e.id;
 elsif p_action='delete_event' then update public.tbl_events set is_deleted=true,is_admin_pinned=false,updated_at=now() where id=e.id;
 elsif p_action='restore_event' then
  if exists(select 1 from public.tbl_activity_payments where event_id=e.id and status in ('paid','success')) then raise exception 'Paid activity restoration requires financial reconciliation';end if;
  update public.tbl_events set is_deleted=false,is_cancelled=false,updated_at=now() where id=e.id;
 end if;
 if p_action in ('warn_host','suspend_host') then
  insert into public.tbl_notifications(user_id,sender_id,type,reference_id,title,body,data)
  values(e.created_by,public.current_app_user_id(),'system',e.id::text,'WeNitro activity moderation',p_reason,jsonb_build_object('eventId',e.id));count_sent:=1;
 elsif p_action in ('cancel_event','delete_event','notify_participants') then
  insert into public.tbl_notifications(user_id,sender_id,type,reference_id,title,body,data)
  select u,public.current_app_user_id(),'system',e.id::text,
   case p_action when 'cancel_event' then 'Activity cancelled' when 'delete_event' then 'Activity removed' else 'Activity update' end,
   e.title||': '||p_reason,jsonb_build_object('eventId',e.id)
  from(select e.created_by u union select user_id from public.tbl_event_participants where event_id=e.id and lower(status) in ('approved','joined','confirmed','registered')) recipients;
  get diagnostics count_sent=row_count;
 end if;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
 values(auth.uid(),'activity',e.id,p_action,btrim(p_reason),old_state,jsonb_build_object('notifications',count_sent));
 return jsonb_build_object('id',e.id,'action',p_action,'notifications',count_sent);
end $$;

alter table public.tbl_user_reports add column status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed'));
alter table public.tbl_event_reports add column status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed'));
create function public.admin_review_report(p_type text,p_id integer,p_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_status text;table_name text;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_type not in ('user','event') or p_status not in ('reviewing','resolved','dismissed','open') or p_type is null or p_status is null then raise exception 'Invalid report state';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'Review reason required (5–1000 characters)';end if;
 table_name:=case p_type when 'user' then 'tbl_user_reports' else 'tbl_event_reports' end;
 execute format('select status from public.%I where id=$1 for update',table_name) into previous_status using p_id;
 if previous_status is null then raise exception 'Report unavailable';end if;
 execute format('update public.%I set status=$1 where id=$2',table_name) using p_status,p_id;
 if previous_status<>p_status then
  insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
  values(auth.uid(),p_type||'_report',p_id,'review_report',btrim(p_reason),jsonb_build_object('status',previous_status),jsonb_build_object('status',p_status));
 end if;
 return jsonb_build_object('id',p_id,'status',p_status);
end $$;
create function public.admin_operation_logs() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 return(select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]'::jsonb) from(select l.*,coalesce(u.email,l.actor_id::text) actor from private.admin_operation_audit l left join auth.users u on u.id=l.actor_id order by l.id desc limit 1000)a);
end $$;
revoke all on function public.admin_moderate_user(integer,text,text),public.admin_moderate_activity(integer,text,text),public.admin_review_report(text,integer,text,text),public.admin_operation_logs() from public,anon;
grant execute on function public.admin_moderate_user(integer,text,text),public.admin_moderate_activity(integer,text,text),public.admin_review_report(text,integer,text,text),public.admin_operation_logs() to authenticated;

create function private.protect_report_review_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.is_wenitro_admin() then
  if tg_op='INSERT' then new.status:='open';
  elsif new.status is distinct from old.status then raise exception 'Only an administrator can review reports' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_report_review_status() from public,anon,authenticated;
create trigger protect_report_review before insert or update on public.tbl_user_reports for each row execute function private.protect_report_review_status();
create trigger protect_report_review before insert or update on public.tbl_event_reports for each row execute function private.protect_report_review_status();
