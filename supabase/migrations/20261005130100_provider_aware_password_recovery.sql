-- Provider-aware recovery is evaluated with service_role so the public client
-- never receives an account-existence or provider-method result.
create or replace function public.email_has_password_identity(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1
  from auth.users u
  join auth.identities i on i.user_id=u.id and i.provider='email'
  where lower(u.email)=lower(trim(p_email))
 );
$$;
revoke all on function public.email_has_password_identity(text) from public,anon,authenticated;
grant execute on function public.email_has_password_identity(text) to service_role;

notify pgrst,'reload schema';
