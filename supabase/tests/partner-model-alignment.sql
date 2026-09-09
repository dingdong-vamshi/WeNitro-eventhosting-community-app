-- Optional Partner model regression. MCP project klyjzbisgycegkkacbjw only.
-- Existing QA identities, transaction-local setup, no Auth mutation/provider calls.
begin;
create temporary table alignment_assertions(label text primary key, passed boolean not null);
grant all on alignment_assertions to authenticated;
create function pg_temp.assert_ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %',label; end if;
 insert into alignment_assertions values(label,true);
end $$;
create function pg_temp.expect_error(label text, statement text, message_fragment text default null) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when others then
  if message_fragment is not null and position(lower(message_fragment) in lower(sqlerrm))=0 then raise exception 'Unexpected error for %: %',label,sqlerrm; end if;
  rejected:=true;
 end;
 perform pg_temp.assert_ok(label,rejected);
end $$;

do $$
declare ids integer[]; auth_ids uuid[]; a integer; b integer; participant integer;
 profile jsonb; transactions jsonb; dashboard jsonb; item jsonb; existing_event integer;
 free_event integer; paid_event integer; other_event integer; result_id integer;
 expected_gross bigint; expected_fee bigint; expected_net bigint; expected_count bigint; user_count bigint;
begin
 -- Restrict to the established QA identities and prioritize the host with actual
 -- provider-verified payment evidence. Both arrays use identical ordering.
 select array_agg(id order by paid_host desc,id),array_agg(auth_user_id order by paid_host desc,id) into ids,auth_ids
 from (
  select u.id,u.auth_user_id,exists(
   select 1 from public.tbl_events e join public.tbl_activity_payments p on p.event_id=e.id
   where e.created_by=u.id and p.status='paid' and p.last_verified_at is not null
     and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')
  ) as paid_host
  from public.tbl_users u join auth.users au on au.id=u.auth_user_id
  where u.is_active=1 and coalesce(u.is_delete,0)=0
    and (au.email_confirmed_at is not null or au.phone_confirmed_at is not null)
    and (lower(btrim(u.fullname)) in ('suchit pradhan','priya nair') or lower(btrim(u.fullname)) like '%qa%admin%')
  order by paid_host desc,u.id limit 3
 ) candidates;
 perform pg_temp.assert_ok('three existing verified QA identities available',cardinality(ids)=3);
 a:=ids[1];b:=ids[2];participant:=ids[3];
 select count(*) into user_count from public.tbl_users;
 select min(e.id),sum(p.amount_paisa),sum(p.platform_fee_paisa),sum(p.partner_net_paisa),count(*) into existing_event,expected_gross,expected_fee,expected_net,expected_count
 from public.tbl_events e join public.tbl_activity_payments p on p.event_id=e.id
 where e.created_by=a and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS');
 perform pg_temp.assert_ok('positive real verified payment evidence available',expected_gross>0);
 delete from public.tbl_partner_profiles where user_id=any(ids);
 perform pg_temp.assert_ok('profile deletion clears compatibility projection',not exists(select 1 from public.tbl_users where id=any(ids) and account_type<>'individual'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[1],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 profile:=public.get_my_partner_profile();
 perform pg_temp.assert_ok('normal identity has optional absent profile',profile->'profile'='null'::jsonb and (profile->>'eligible')::boolean);
 perform pg_temp.assert_ok('normal identity unchanged',public.get_current_app_user_id()=a);
 perform pg_temp.expect_error('Individual cannot access Partner transactions','select public.get_partner_transactions()','Partner');
 perform pg_temp.expect_error('Individual paid hosting RPC denied','select public.create_activity(''{"title":"ROLLBACK blocked paid","join_type":"direct","is_paid":true,"price_inr":10}'')','Partner');
 perform pg_temp.expect_error('Individual paid hosting direct insert denied',format('insert into public.tbl_events(created_by,title,is_paid,price,status,join_type,visibility_type) values(%s,''ROLLBACK blocked direct'',true,10,''published'',''direct'',''public'')',a));
 free_event:=public.create_activity('{"title":"ROLLBACK free remains available","join_type":"direct","max_participants":3}');
 perform pg_temp.assert_ok('Individual free hosting allowed',free_event>0);
 perform pg_temp.expect_error('Individual cannot upgrade free event to paid',format('select public.update_activity(%s,''{"is_paid":true,"price_inr":10}'')',free_event),'Partner');
 result_id:=public.update_activity(existing_event,'{}');
 perform pg_temp.assert_ok('existing unchanged paid event remains manageable',result_id=existing_event);
 perform pg_temp.expect_error('existing paid price change needs capability',format('select public.update_activity(%s,''{"price_inr":11}'')',existing_event),'Partner');
 perform pg_temp.expect_error('direct profile self-activation denied',format('insert into public.tbl_partner_profiles(user_id,business_name,status) values(%s,''Bad direct activation'',''active'')',a),'permission');
 perform pg_temp.expect_error('business name validation enforced','select public.save_my_partner_profile(''x'')','business name');
 profile:=public.save_my_partner_profile('  QA Business A  ','  Description A  ','  Hyderabad  ');
 perform pg_temp.assert_ok('onboarding activates without Admin approval',profile->'profile'->>'status'='active');
 perform pg_temp.assert_ok('onboarding stays linked to same identity',(profile->'profile'->>'user_id')::integer=a and public.get_current_app_user_id()=a);
 perform pg_temp.assert_ok('business details normalized',profile->'profile'->>'business_name'='QA Business A' and profile->'profile'->>'description'='Description A' and profile->'profile'->>'city'='Hyderabad');
 profile:=public.save_my_partner_profile('QA Business A','Description A','Hyderabad');
 perform pg_temp.assert_ok('onboarding retries create only one profile',(select count(*) from public.tbl_partner_profiles where user_id=a)=1);
 profile:=public.save_my_partner_profile('QA Business A edited','Updated description','Pune');
 perform pg_temp.assert_ok('business profile editable without new identity',profile->'profile'->>'business_name'='QA Business A edited' and (profile->'profile'->>'user_id')::integer=a);
 perform pg_temp.assert_ok('active profile projects Partner compatibility',(select account_type from public.tbl_users where id=a)='partner');
 paid_event:=public.create_activity('{"title":"ROLLBACK Partner paid available","join_type":"direct","is_paid":true,"price_inr":10,"max_participants":3}');
 perform pg_temp.assert_ok('active Partner can host paid activity',paid_event>0);
 transactions:=public.get_partner_transactions();
 perform pg_temp.assert_ok('transaction count matches verified payments',jsonb_array_length(transactions)=expected_count);
 perform pg_temp.assert_ok('transactions reconcile positive gross fee net',(select sum((t->>'amount_paisa')::bigint) from jsonb_array_elements(transactions)t)=expected_gross and (select sum((t->>'platform_fee_paisa')::bigint) from jsonb_array_elements(transactions)t)=expected_fee and (select sum((t->>'partner_net_paisa')::bigint) from jsonb_array_elements(transactions)t)=expected_net);
 perform pg_temp.assert_ok('transaction rows exclude contacts',not exists(select 1 from jsonb_array_elements(transactions)t where t ?| array['email','phone','phonenumber','phone_e164','provider_metadata','payment_session_id']));
 execute 'reset role';
 perform pg_temp.assert_ok('onboarding created no normal identity duplicates',(select count(*) from public.tbl_users)=user_count);
 perform pg_temp.expect_error('normalized profile unique per user',format('insert into public.tbl_partner_profiles(user_id,business_name,status) values(%s,''Duplicate'',''active'')',a),'duplicate');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[2],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 profile:=public.save_my_partner_profile('QA Business B');
 other_event:=public.create_activity('{"title":"ROLLBACK Partner B event","join_type":"direct"}');
 perform pg_temp.assert_ok('Partner B cannot read Partner A optional profile',(select count(*) from public.tbl_partner_profiles where user_id=a)=0);
 perform pg_temp.expect_error('Partner B cannot alter Partner A profile',format('update public.tbl_partner_profiles set business_name=''tampered'' where user_id=%s',a),'permission');
 perform pg_temp.expect_error('Partner B cannot read Partner A transaction RPC',format('select public.get_partner_transactions(%s)',existing_event),'ownership');
 transactions:=public.get_partner_transactions();
 perform pg_temp.assert_ok('Partner B aggregate transactions exclude Partner A',not exists(select 1 from jsonb_array_elements(transactions)t join public.tbl_events e on e.id=(t->>'event_id')::integer where e.created_by=a));
 perform public.request_join_activity(free_event);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[1],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 dashboard:=public.get_partner_dashboard();
 select t into item from jsonb_array_elements(dashboard->'activities')t where (t->>'event_id')::integer=free_event;
 perform pg_temp.assert_ok('capacity and remaining slots use real registrations',(item->>'capacity')::integer=3 and (item->>'remaining_slots')::integer=2 and (item->>'registration_count')::integer=1);
 perform pg_temp.expect_error('Partner A cannot read Partner B transactions',format('select public.get_partner_transactions(%s)',other_event),'ownership');
 execute 'reset role';
 update public.tbl_partner_profiles set status='suspended' where user_id=a;
 execute 'set local role authenticated';
 perform pg_temp.expect_error('suspended Partner cannot self-reactivate','select public.save_my_partner_profile(''Try reactivate'')','unavailable');
 perform pg_temp.expect_error('suspended Partner cannot use dashboard','select public.get_partner_dashboard()','Partner');
 execute 'reset role';
 update public.tbl_partner_profiles set status='rejected' where user_id=a;
 execute 'set local role authenticated';
 perform pg_temp.expect_error('rejected Partner cannot self-reactivate','select public.save_my_partner_profile(''Try reactivate'')','unavailable');
 execute 'reset role';
 update public.tbl_partner_profiles set status='pending' where user_id=a;
 execute 'set local role authenticated';
 profile:=public.save_my_partner_profile('QA active without approval');
 perform pg_temp.assert_ok('pending onboarding does not require Admin approval',profile->'profile'->>'status'='active');
 execute 'reset role';
 update public.tbl_users set is_active=0 where id=a;
 execute 'set local role authenticated';
 perform pg_temp.expect_error('ineligible identity cannot onboard','select public.save_my_partner_profile(''Ineligible'')','Verify');
 perform pg_temp.expect_error('ineligible active profile cannot host paid','select public.create_activity(''{"title":"ROLLBACK inactive blocked","join_type":"direct","is_paid":true,"price_inr":10}'')','Partner');
 profile:=public.get_my_partner_profile();
 perform pg_temp.assert_ok('profile eligibility reflects identity suspension',(profile->>'eligible')::boolean=false);
 execute 'reset role';
 update public.tbl_users set is_active=1 where id=a;
 perform set_config('request.jwt.claims','{}',true);
 execute 'set local role anon';
 begin perform public.save_my_partner_profile('Anonymous'); raise exception 'Anonymous unexpectedly allowed'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform pg_temp.assert_ok('anonymous onboarding denied',true);
end $$;
select count(*) as passed_assertions,bool_and(passed) as all_passed,jsonb_agg(label order by label) as checks from alignment_assertions;
rollback;
