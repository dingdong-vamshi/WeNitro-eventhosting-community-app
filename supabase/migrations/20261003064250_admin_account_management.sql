-- Server-enforced administration. Revocation must also affect already-issued JWTs.
create or replace function private.current_admin_role()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select u.raw_app_meta_data->>'role' from auth.users u
    where u.id=auth.uid() and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'admin_status','active')='active'), '')
$$;
revoke all on function private.current_admin_role() from public,anon;
grant execute on function private.current_admin_role() to authenticated;

create or replace function public.is_wenitro_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_admin_role() in ('admin','super_admin')
$$;
create or replace function private.is_finance_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_admin_role() in ('finance_admin','super_admin')
$$;

create table private.admin_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  previous_role text,
  next_role text not null,
  previous_status text,
  next_status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table private.admin_access_audit enable row level security;
revoke all on private.admin_access_audit from public,anon,authenticated;

create function public.admin_accounts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor_role text:=private.current_admin_role(); result jsonb;
begin
 if actor_role not in ('super_admin','admin','finance_admin') then raise exception 'Admin permission required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',u.id,'fullName',coalesce(u.raw_user_meta_data->>'full_name',u.email),
  'email',u.email,'phone',coalesce(u.phone,''),'role',u.raw_app_meta_data->>'role',
  'status',coalesce(u.raw_app_meta_data->>'admin_status','active'),
  'twoFAEnabled',exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified'),
  'createdAt',u.created_at,'lastLogin',u.last_sign_in_at,'avatar','') order by u.created_at),'[]'::jsonb) into result
 from auth.users u where u.raw_app_meta_data->>'role' in ('super_admin','admin','finance_admin')
 and (actor_role='super_admin' or u.id=auth.uid());
 return result;
end $$;

create function public.admin_set_account_access(p_email text,p_role text,p_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target auth.users%rowtype;
begin
 if private.current_admin_role()<>'super_admin' then raise exception 'Master (Super Admin) permission required' using errcode='42501'; end if;
 if p_role is null or p_role not in ('super_admin','admin','finance_admin') or p_status is null or p_status not in ('active','inactive','suspended') then raise exception 'Invalid administrator role or status'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A reason of 5–1000 characters is required'; end if;
 perform pg_advisory_xact_lock(194230637);
 select * into target from auth.users where lower(email)=lower(btrim(p_email)) for update;
 if not found then raise exception 'No registered WeNitro account has this email. Ask the person to sign in to WeNitro first.'; end if;
 if target.email_confirmed_at is null then raise exception 'The account must verify its email before receiving administrator access'; end if;
 if target.id=auth.uid() then raise exception 'You cannot change your own administrator access'; end if;
 if coalesce(target.raw_app_meta_data->>'role','')=p_role and coalesce(target.raw_app_meta_data->>'admin_status','active')=p_status then
  return jsonb_build_object('id',target.id,'changed',false);
 end if;
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',p_role,'admin_status',p_status),updated_at=now() where id=target.id;
 insert into private.admin_access_audit(actor_id,target_id,previous_role,next_role,previous_status,next_status,reason)
 values(auth.uid(),target.id,target.raw_app_meta_data->>'role',p_role,target.raw_app_meta_data->>'admin_status',p_status,btrim(p_reason));
 return jsonb_build_object('id',target.id,'changed',true);
end $$;

create function public.admin_access_logs()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if private.current_admin_role()<>'super_admin' then raise exception 'Master permission required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'admin',coalesce(actor.email,a.actor_id::text),
  'target',coalesce(target.email,a.target_id::text),'action',a.next_role||' / '||a.next_status,
  'reason',a.reason,'createdAt',a.created_at) order by a.id desc),'[]'::jsonb)
  from (select * from private.admin_access_audit order by id desc limit 500) a
  left join auth.users actor on actor.id=a.actor_id left join auth.users target on target.id=a.target_id);
end $$;
revoke all on function public.admin_accounts(),public.admin_set_account_access(text,text,text,text),public.admin_access_logs() from public,anon;
grant execute on function public.admin_accounts(),public.admin_set_account_access(text,text,text,text),public.admin_access_logs() to authenticated;
