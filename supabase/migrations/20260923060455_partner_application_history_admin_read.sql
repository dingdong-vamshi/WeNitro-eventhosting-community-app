-- Keep Partner application history private while exposing the minimum review
-- fields to authenticated WeNitro administrators through an audited RPC.

create or replace function public.admin_list_partner_application_history(
  p_user_id integer
) returns table (
  id bigint,
  user_id integer,
  from_status text,
  to_status text,
  reason text,
  actor_user_id integer,
  created_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_wenitro_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  return query
  select history.id, history.user_id, history.from_status, history.to_status,
    history.reason, history.actor_user_id, history.created_at
  from public.tbl_partner_application_history history
  where history.user_id=p_user_id
  order by history.created_at desc;
end
$$;

revoke all on function public.admin_list_partner_application_history(integer)
from public, anon;
grant execute on function public.admin_list_partner_application_history(integer)
to authenticated;

comment on function public.admin_list_partner_application_history(integer) is
'Returns non-sensitive Partner review history to authenticated WeNitro administrators.';
