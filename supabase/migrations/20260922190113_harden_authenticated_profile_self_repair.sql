-- Keep the privileged implementation outside the exposed API schema. The
-- public endpoint is an invoker-rights wrapper and the private implementation
-- still validates auth.uid() before touching a profile.
alter function public.bootstrap_my_profile() set schema private;

create function public.bootstrap_my_profile()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.bootstrap_my_profile()
$$;

revoke all on function private.bootstrap_my_profile(), public.bootstrap_my_profile()
from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.bootstrap_my_profile(), public.bootstrap_my_profile()
to authenticated;
notify pgrst, 'reload schema';
