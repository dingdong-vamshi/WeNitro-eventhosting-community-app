create table public.tbl_signup_policy_acceptances (
  user_id integer not null references public.tbl_users(id) on delete cascade,
  policy_version text not null check(policy_version='2026-10-01'),
  accepted_at timestamptz not null default now(),
  primary key(user_id,policy_version)
);
alter table public.tbl_signup_policy_acceptances enable row level security;
revoke all on public.tbl_signup_policy_acceptances from public,anon,authenticated;
grant select on public.tbl_signup_policy_acceptances to authenticated;
create policy signup_policy_own_read on public.tbl_signup_policy_acceptances for select
to authenticated using(user_id=(select public.get_current_app_user_id()));
create function public.accept_signup_policies(p_policy_version text) returns void
language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id();
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_policy_version is distinct from '2026-10-01' then raise exception 'Review the current policies before continuing' using errcode='22023'; end if;
  insert into public.tbl_signup_policy_acceptances(user_id,policy_version)
  values(me,p_policy_version) on conflict do nothing;
end $$;
revoke all on function public.accept_signup_policies(text) from public,anon;
grant execute on function public.accept_signup_policies(text) to authenticated;
create function private.require_signup_policy_agreement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Existing onboarded accounts are not retroactively interrupted.
  if auth.uid() is not null and new.onboarding_completed and not old.onboarding_completed
    and not exists(select 1 from public.tbl_signup_policy_acceptances
      where user_id=new.id and policy_version='2026-10-01') then
    raise exception 'Please agree to the Terms and Privacy Policy before completing signup.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.require_signup_policy_agreement() from public,anon,authenticated;
create trigger require_signup_policy_agreement before update of onboarding_completed
on public.tbl_users for each row execute function private.require_signup_policy_agreement();
