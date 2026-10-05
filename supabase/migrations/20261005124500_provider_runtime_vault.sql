-- Supabase Vault fallback for Edge runtimes when project-level Edge secrets are
-- managed outside the available deployment connector. Only fixed WeNitro keys
-- are returned, and only to service_role.
create or replace function public.provider_runtime_secrets()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(mapped.environment_name,s.decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets s
 join (values
  ('wenitro_aadhaar_enabled','AADHAAR_OKYC_ENABLED'),
  ('wenitro_sandbox_environment','SANDBOX_ENVIRONMENT'),
  ('wenitro_sandbox_base_url','SANDBOX_BASE_URL'),
  ('wenitro_sandbox_api_key','SANDBOX_API_KEY'),
  ('wenitro_sandbox_api_secret','SANDBOX_API_SECRET'),
  ('wenitro_openai_api_key','OPENAI_API_KEY'),
  ('wenitro_moderation_qa_fixtures','MODERATION_QA_FIXTURES_ENABLED')
 ) mapped(secret_name,environment_name) on mapped.secret_name=s.name
$$;
revoke all on function public.provider_runtime_secrets() from public,anon,authenticated;
grant execute on function public.provider_runtime_secrets() to service_role;

notify pgrst,'reload schema';
