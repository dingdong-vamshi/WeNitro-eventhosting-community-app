create table public.tbl_partner_terms_acceptances (
  user_id integer primary key references public.tbl_users(id) on delete cascade,
  policy_version text not null default '2026-10-01',
  accepted_at timestamptz not null default now()
);
alter table public.tbl_partner_terms_acceptances enable row level security;
revoke all on public.tbl_partner_terms_acceptances from public,anon,authenticated;
grant select on public.tbl_partner_terms_acceptances to authenticated;
create policy partner_terms_own_read on public.tbl_partner_terms_acceptances for select
to authenticated using(user_id=(select public.get_current_app_user_id()));
create or replace function public.submit_partner_application(p_application jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_application->'terms_accepted' is distinct from 'true'::jsonb then
    raise exception 'Agree to the Terms & Conditions before applying.' using errcode='22023';
  end if;
  result:=private.submit_partner_application(p_application);
  insert into public.tbl_partner_terms_acceptances(user_id) values(me)
    on conflict(user_id) do update set policy_version='2026-10-01',accepted_at=now();
  return result;
end $$;
revoke all on function public.submit_partner_application(jsonb) from public,anon;
grant execute on function public.submit_partner_application(jsonb) to authenticated,service_role;
