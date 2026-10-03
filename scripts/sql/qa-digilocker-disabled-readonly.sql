-- Read only. Run AFTER coordinator deployment signal. Contains no DDL or writes.
-- Counts expose no account/session identifiers or identity documents.
select jsonb_build_object(
 'private_rls', (select relrowsecurity from pg_class where oid='private.aadhaar_verification_sessions'::regclass),
 'anon_table_select',has_table_privilege('anon','private.aadhaar_verification_sessions','SELECT'),
 'authenticated_table_select',has_table_privilege('authenticated','private.aadhaar_verification_sessions','SELECT'),
 'anon_service_execute',has_function_privilege('anon','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE'),
 'authenticated_service_execute',has_function_privilege('authenticated','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE'),
 'service_execute',has_function_privilege('service_role','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE'),
 'session_rows',(select count(*) from private.aadhaar_verification_sessions),
 'verified_rows',(select count(*) from private.aadhaar_verification_sessions where verified_at is not null),
 'test_verified_rows',(select count(*) from private.aadhaar_verification_sessions where environment='test' and verified_at is not null),
 'trust_uses_private_signal',position('private.has_verified_aadhaar(p_user_id)' in pg_get_functiondef('private.trust_score_for(integer)'::regprocedure))>0,
 'sync_uses_private_signal',position('private.has_verified_aadhaar(me)' in pg_get_functiondef('private.sync_verification_rewards(uuid)'::regprocedure))>0,
 'sensitive_columns',(select count(*) from information_schema.columns where table_schema='private' and table_name='aadhaar_verification_sessions' and column_name ~ '(number|otp|photo|document|url|address|name)')
) as digilocker_disabled_boundary;
