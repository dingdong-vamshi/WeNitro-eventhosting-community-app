-- Run only after coordinator deployment readiness on cxsznhrkzqndhseodcyy.
-- Entirely rolled back synthetic DB contract checks; NO Google/provider request.
-- Existing QA host119 must remain active. Never replace with a real customer.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
select set_config('qa.google_retention_result','[]',true);
do $$
declare place text:='wenitro_qa_rollback_'||txid_current(); host_auth uuid; receipt jsonb; eid integer; row_event public.tbl_events%rowtype;
begin
 select auth_user_id into host_auth from public.tbl_users where id=119 and fullname like '%QA%';
 if host_auth is null then raise exception 'Expected synthetic QA host119 unavailable; do not substitute a customer';end if;
 if has_function_privilege('authenticated','public.cache_google_place_coordinates(text,double precision,double precision)','EXECUTE')
 or has_function_privilege('anon','public.cache_google_place_coordinates(text,double precision,double precision)','EXECUTE')
 or not has_function_privilege('service_role','public.cache_google_place_coordinates(text,double precision,double precision)','EXECUTE') then raise exception 'Cache RPC ACL failed';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Cache writer service-only ACL','passed',true)))::text,true);
 if has_table_privilege('authenticated','private.google_place_coordinate_cache','SELECT')
 or has_table_privilege('authenticated','private.google_place_coordinate_cache','INSERT')
 or has_table_privilege('anon','private.google_place_coordinate_cache','SELECT') then raise exception 'Cache table grants too broad';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Private cache not granted to app roles','passed',true)))::text,true);
 if has_function_privilege('authenticated','private.purge_expired_google_coordinates()','EXECUTE')
 or has_function_privilege('anon','private.purge_expired_google_coordinates()','EXECUTE') then raise exception 'Purge ACL failed';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Purge denied to app roles','passed',true)))::text,true);
 if (select count(*) from cron.job where jobname='wenitro-google-coordinate-retention' and active and schedule='0 * * * *' and command='select private.purge_expired_google_coordinates()')<>1 then raise exception 'Expected exactly one active hourly retention job';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Exactly one active hourly SQL-only retention job','passed',true)))::text,true);
 -- Synthetic coordinates are an isolated transactional fixture, not a provider receipt.
 receipt:=public.cache_google_place_coordinates(place,12.3,77.4);
 if (receipt->>'expiresAt')::timestamptz not between now()+interval '27 days 23 hours' and now()+interval '29 days' then raise exception 'Cache TTL failed';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Synthetic receipt bounded below30days','passed',true)))::text,true);
 perform set_config('request.jwt.claim.sub',host_auth::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',host_auth,'role','authenticated')::text,true);
 eid:=public.create_activity(jsonb_build_object('title','[QA] Google retention rollback only','join_type','direct','location_source','google','google_place_id',place,'location','MUST NOT PERSIST PROVIDER ADDRESS','display_location','MUST NOT PERSIST PROVIDER NAME','latitude',89,'longitude',179));
 select * into row_event from public.tbl_events where id=eid;
 if row_event.location<>'Google Maps venue' or row_event.display_location<>'Google Maps venue' or row_event.latitude<>12.3 or row_event.longitude<>77.4 then raise exception 'Trusted coordinate/static label binding failed';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Real current create RPC trusted binding/static labels','passed',true)))::text,true);
 update public.tbl_events set location_coordinates_expires_at=now()+interval '99 days',latitude=85 where id=eid;
 if (select location_coordinates_expires_at<>(receipt->>'expiresAt')::timestamptz or latitude<>12.3 from public.tbl_events where id=eid) then raise exception 'TTL/coordinate tampering not constrained';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Direct coordinate/TTL tampering constrained','passed',true)))::text,true);
 update private.google_place_coordinate_cache set expires_at=now()-interval '1 second' where place_id=place;
 perform public.update_activity(eid,'{"description":"Unrelated expired venue edit"}');
 if not (select latitude is null and longitude is null and google_place_id=place from public.tbl_events where id=eid) then raise exception 'Expired same place edit failed';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Expired unrelated edit retains PlaceID but clears coordinates','passed',true)))::text,true);
 receipt:=public.cache_google_place_coordinates(place,13.4,78.5);
 if not (select latitude=13.4 and longitude=78.5 and location_coordinates_expires_at=(receipt->>'expiresAt')::timestamptz from public.tbl_events where id=eid) then raise exception 'Fresh receipt did not renew reference';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','New synthetic receipt renews existing reference','passed',true)))::text,true);
 -- Purge contract/body and actual local59-check regression prove clearing; do not run
 -- the global dispatcher here because unrelated production rows must be untouched.
 if position('delete from private.google_place_coordinate_cache' in pg_get_functiondef('private.purge_expired_google_coordinates()'::regprocedure))=0
 or position('update public.tbl_events set latitude=null,longitude=null' in pg_get_functiondef('private.purge_expired_google_coordinates()'::regprocedure))=0 then raise exception 'Purge definition mismatch';end if;
 perform set_config('qa.google_retention_result',(current_setting('qa.google_retention_result')::jsonb||jsonb_build_array(jsonb_build_object('check','Deployed purge clears both stores (global execution excluded)','passed',true)))::text,true);
end $$;
select jsonb_build_object('status','PASS_ROLLBACK_ONLY','checks',current_setting('qa.google_retention_result')::jsonb,
 'scope','Synthetic transactional database contract only; no actual Google provider proof. All fixture changes rolled back.') as proof;
rollback;
