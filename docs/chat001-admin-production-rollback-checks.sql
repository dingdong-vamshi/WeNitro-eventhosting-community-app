-- Acceptance template only. Do not run before coordinator readiness.
-- Substitute ADMIN_AUTH_UUID, HOST_AUTH_UUID and QA_EVENT_PAYLOAD_JSON from the
-- dedicated ignored fixture manifest. Validate UUIDs before substitution.
-- Execute this entire file as one SQL transaction. Nothing below is committed.
begin;
select set_config('request.jwt.claim.sub','ADMIN_AUTH_UUID',true);
set local role authenticated;
select key,enabled from public.admin_feature_gates();
select key,enabled from public.admin_feature_gates('activities',false,'CHAT001 rollback-only production creation-gate acceptance');
select set_config('request.jwt.claim.sub','HOST_AUTH_UUID',true);
do $$
begin
 begin
  perform public.create_activity('QA_EVENT_PAYLOAD_JSON'::jsonb,'published');
  raise exception 'QA FAILURE: paused Activity creation was allowed';
 exception when insufficient_privilege then
  if sqlerrm not like '%creation is temporarily paused by WeNitro.%' then raise;end if;
  raise notice 'PASS: production Activity creation gate rejects the real authenticated RPC';
 end;
end $$;
select set_config('request.jwt.claim.sub','ADMIN_AUTH_UUID',true);
select key,enabled from public.admin_feature_gates();
rollback;
-- Read all four enabled states in a separate authenticated read after rollback.
-- The private fixture Activity/category used above must be active, not archived.
