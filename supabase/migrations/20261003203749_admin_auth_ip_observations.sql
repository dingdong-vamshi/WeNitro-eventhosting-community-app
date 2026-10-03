-- Read existing Auth observations without exposing auth tables or raw payloads.
create function public.admin_auth_ip_observations(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare query_text text := btrim(coalesce(p_search, '')); result jsonb;
begin
  if not coalesce(private.account_is_allowed(), false)
     or not coalesce(public.is_wenitro_admin(), false) then
    raise exception 'Active Admin permission required' using errcode = '42501';
  end if;
  if length(query_text) > 64 then
    raise exception 'Search must contain at most 64 characters' using errcode = '22023';
  end if;
  with recent as materialized (
    select a.id, a.created_at, left(btrim(a.ip_address), 64) as ip_address,
      case when a.payload->>'action' ~ '^[a-z][a-z0-9_]{0,63}$'
        then a.payload->>'action' else null end as action,
      case when a.payload->>'actor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.payload->>'actor_id')::uuid else null end as actor_auth_id
    from auth.audit_log_entries a
    where nullif(btrim(a.ip_address), '') is not null
    order by a.created_at desc nulls last, a.id desc
    limit 500
  ), observations as (
    select r.id, r.created_at, r.ip_address, r.action,
      (select u.id from public.tbl_users u where u.auth_user_id = r.actor_auth_id order by u.id limit 1) as actor_user_id
    from recent r
  ), matching as materialized (
    select o.* from observations o where query_text = ''
      or position(lower(query_text) in lower(o.ip_address)) > 0
      or position(lower(query_text) in lower(coalesce(o.action, ''))) > 0
      or o.actor_user_id::text = query_text
  ), page as (
    select * from matching order by created_at desc nulls last, id desc limit 100
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'occurredAt', p.created_at, 'ipAddress', p.ip_address,
      'action', p.action, 'actorUserId', p.actor_user_id
    ) order by p.created_at desc nulls last, p.id desc) from page p), '[]'::jsonb),
    'candidateCount', (select count(*) from recent),
    'matchingCount', (select count(*) from matching),
    'candidateLimit', 500, 'resultLimit', 100
  ) into result;
  return result;
end $$;
revoke all on function public.admin_auth_ip_observations(text) from public, anon;
grant execute on function public.admin_auth_ip_observations(text) to authenticated;
comment on function public.admin_auth_ip_observations(text) is
  'Current Admin/Master-only reader of latest500 retained Auth IP observations, returning at most100 search matches. No raw payload, email, geolocation, inferred risk or IP enforcement.';
