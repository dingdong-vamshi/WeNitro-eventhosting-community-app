-- Run only through connected MCP on klyjzbisgycegkkacbjw after Phase 1 migration.
-- Every activity/answer/classification change rolls back; no Auth writes or provider calls.
begin;
create temporary table phase1_assertions(label text primary key, passed boolean not null);
grant all on phase1_assertions to authenticated;
create function pg_temp.assert_ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %',label; end if;
 insert into phase1_assertions values(label,true);
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
 free_direct integer; free_approval integer; paid_direct integer; paid_approval integer; b_event integer;
 ev integer; qs jsonb; answers jsonb; r public.tbl_event_participants; dashboard jsonb; expected_gross bigint; expected_fee bigint; expected_net bigint;
 payment public.tbl_activity_payments; count_before bigint; q_first bigint; bridge_definition text;
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
 insert into public.tbl_partner_profiles(user_id,business_name,status) values(a,'Existing QA Partner A','active'),(b,'Existing QA Partner B','active') on conflict(user_id) do update set status='active',business_name=excluded.business_name;
 perform pg_temp.assert_ok('RLS remains enabled',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('tbl_users','tbl_events','tbl_event_participants','tbl_activity_payments','tbl_activity_registration_questions','tbl_activity_registration_answers') and not c.relrowsecurity));
 perform pg_temp.assert_ok('existing verified paid snapshots reconcile',not exists(select 1 from public.tbl_activity_payments where status='paid' and last_verified_at is not null and paid_at is not null and provider_status in ('PAID','SUCCESS') and (platform_fee_bps is distinct from 500 or platform_fee_paisa is distinct from round(amount_paisa::numeric*500/10000)::bigint or partner_net_paisa is distinct from amount_paisa-platform_fee_paisa)));
 select pg_get_functiondef('private.handle_new_auth_user()'::regprocedure) into bridge_definition;
 perform pg_temp.assert_ok('signup intent only initializes optional draft profile',
   bridge_definition like '%insert into public.tbl_partner_profiles(user_id,status) values(v_user_id,''draft'')%'
   and split_part(bridge_definition,'v_uuid_suffix :=',1) not like '%account_type%');
 -- These updates run inside expected-failure subtransactions and cannot persist.
 select * into payment from public.tbl_activity_payments where status='paid' and last_verified_at is not null and paid_at is not null and provider_status in ('PAID','SUCCESS') order by id limit 1;
 perform pg_temp.expect_error('verified fee snapshot immutable even to direct DB writes',format('update public.tbl_activity_payments set platform_fee_paisa=platform_fee_paisa+1 where id=%s',payment.id),'immutable');
 perform pg_temp.expect_error('verified gross immutable even to direct DB writes',format('update public.tbl_activity_payments set amount_paisa=amount_paisa+1 where id=%s',payment.id),'immutable');
 perform pg_temp.assert_ok('existing verified payment evidence available',exists(select 1 from public.tbl_activity_payments where status='paid' and last_verified_at is not null and paid_at is not null and provider_status in ('PAID','SUCCESS')));
 perform pg_temp.assert_ok('fee example 100 rupees is 5 fee and 95 net',round(10000::numeric*500/10000)=500 and 10000-round(10000::numeric*500/10000)=9500);
 select coalesce(sum(p.amount_paisa),0),coalesce(sum(p.platform_fee_paisa),0),coalesce(sum(p.partner_net_paisa),0) into expected_gross,expected_fee,expected_net from public.tbl_activity_payments p join public.tbl_events e on e.id=p.event_id where e.created_by=a and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS');
 perform pg_temp.assert_ok('selected QA host has positive verified gross',expected_gross>0);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[1],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_ok('partner A identity resolved',public.get_current_app_user_id()=a);
 perform pg_temp.assert_ok('partner metadata does not grant Admin',not public.is_wenitro_admin());
 perform pg_temp.expect_error('partner cannot use Admin users RPC','select public.admin_list_users()','Admin');
 dashboard:=public.get_partner_dashboard();
 perform pg_temp.assert_ok('dashboard gross uses verified owned payments',(dashboard->'summary'->>'gross_paisa')::bigint=expected_gross);
 perform pg_temp.assert_ok('dashboard fee and net reconcile',(dashboard->'summary'->>'platform_fee_paisa')::bigint=expected_fee and (dashboard->'summary'->>'net_paisa')::bigint=expected_net);
 perform pg_temp.assert_ok('dashboard only owns its activities',not exists(select 1 from jsonb_array_elements(dashboard->'activities') x join public.tbl_events e on e.id=(x->>'event_id')::integer where e.created_by<>a));
 qs:='[{"label":"Short required","type":"short_text","required":true,"options":[]},{"label":"Dropdown required","type":"single_choice","required":true,"options":["A","B"]},{"label":"Optional agreement","type":"checkbox","required":false,"options":[]},{"label":"Long answer","type":"long_text","required":false,"options":[]},{"label":"Multiple options","type":"multiple_choice","required":false,"options":["A","B"]}]';
 free_direct:=public.create_activity(jsonb_build_object('title','ROLLBACK ONLY Phase1 free direct','join_type','direct','registration_questions',qs));
 free_approval:=public.create_activity(jsonb_build_object('title','ROLLBACK ONLY Phase1 free approval','join_type','approval','registration_questions',qs));
 paid_direct:=public.create_activity(jsonb_build_object('title','ROLLBACK ONLY Phase1 paid direct','join_type','direct','is_paid',true,'price_inr',10,'registration_questions',qs));
 paid_approval:=public.create_activity(jsonb_build_object('title','ROLLBACK ONLY Phase1 paid approval','join_type','approval','is_paid',true,'price_inr',10,'registration_questions',qs));
 perform pg_temp.expect_error('question count limit enforced',format('select public.save_activity_registration_questions(%s,%L::jsonb)',free_direct,(select jsonb_agg(qs->0) from generate_series(1,21))::text),'20');
 perform pg_temp.expect_error('question type whitelist enforced',format('select public.save_activity_registration_questions(%s,%L::jsonb)',free_direct,jsonb_set(qs,'{0,type}','"file_upload"')::text),'Invalid');
 perform pg_temp.expect_error('question required flag must be boolean',format('select public.save_activity_registration_questions(%s,%L::jsonb)',free_direct,jsonb_set(qs,'{0,required}','"true"')::text),'Invalid');
 perform pg_temp.expect_error('question label length limited',format('select public.save_activity_registration_questions(%s,%L::jsonb)',free_direct,jsonb_set(qs,'{0,label}',to_jsonb(repeat('x',241)))::text),'Invalid');
 perform pg_temp.expect_error('question duplicate options rejected',format('select public.save_activity_registration_questions(%s,%L::jsonb)',free_direct,jsonb_set(qs,'{1,options}','["A","A"]')::text),'unique');
 perform pg_temp.assert_ok('question types and order persist',jsonb_array_length(public.get_activity_registration_form(free_direct)->'questions')=5);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[2],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 b_event:=public.create_activity(jsonb_build_object('title','ROLLBACK ONLY Phase1 partner B','join_type','direct','registration_questions',qs));
 perform pg_temp.expect_error('partner B cannot edit partner A questions',format('select public.save_activity_registration_questions(%s,''[]'')',free_direct),'ownership');
 perform pg_temp.expect_error('partner B cannot read partner A registrations',format('select public.get_partner_registrations(%s)',free_direct),'ownership');
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[3],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_ok('individual identity restored',public.get_current_app_user_id()=participant);
 perform pg_temp.expect_error('individual cannot access partner dashboard','select public.get_partner_dashboard()','Partner');
 perform pg_temp.expect_error('individual cannot access private registrations',format('select public.get_partner_registrations(%s)',free_direct),'Partner');
 perform pg_temp.expect_error('account type client escalation blocked',format('update public.tbl_users set account_type=''partner'' where id=%s',participant),'permitted');
 perform pg_temp.expect_error('old join RPC cannot bypass required answers',format('select public.request_join_activity(%s)',free_direct),'required');
 perform pg_temp.expect_error('old payment RPC cannot bypass required answers',format('select public.prepare_activity_payment(%s)',paid_direct),'required');
 perform pg_temp.expect_error('required validation rejects empty form',format('select public.submit_activity_registration(%s,''[]'')',free_direct),'Required');
 perform pg_temp.expect_error('foreign question injection blocked',format('select public.submit_activity_registration(%s,''[{"question_id":-1,"value":"bad"}]'')',free_direct),'unknown');
 select (q->>'id')::bigint into q_first from jsonb_array_elements(public.get_activity_registration_form(free_direct)->'questions') q where q->>'type'='short_text';
 perform pg_temp.expect_error('whitespace required text rejected',format('select public.submit_activity_registration(%s,%L::jsonb)',free_direct,jsonb_build_array(jsonb_build_object('question_id',q_first,'value','   '))::text),'text');
 perform pg_temp.expect_error('duplicate answers rejected',format('select public.submit_activity_registration(%s,%L::jsonb)',free_direct,jsonb_build_array(jsonb_build_object('question_id',q_first,'value','A'),jsonb_build_object('question_id',q_first,'value','B'))::text),'Duplicate');
 foreach ev in array array[free_direct,free_approval,paid_direct,paid_approval,b_event] loop
  select jsonb_agg(jsonb_build_object('question_id',q->'id','value',case q->>'type' when 'short_text' then '"Real RPC transaction test"'::jsonb when 'single_choice' then '"A"'::jsonb when 'checkbox' then 'true'::jsonb when 'long_text' then '"Long answer test"'::jsonb else '["A","B"]'::jsonb end) order by (q->>'display_order')::integer) into answers from jsonb_array_elements(public.get_activity_registration_form(ev)->'questions') q;
  if ev=free_direct then
   perform pg_temp.expect_error('answer envelope must be array',format('select public.submit_activity_registration(%s,''{}'')',ev),'Invalid');
   perform pg_temp.expect_error('short text must be string',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{0,value}','123')::text),'text');
   perform pg_temp.expect_error('short text length limit enforced',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{0,value}',to_jsonb(repeat('x',501)))::text),'text');
   perform pg_temp.expect_error('dropdown unknown option rejected',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{1,value}','"C"')::text),'valid option');
   perform pg_temp.expect_error('checkbox must be boolean',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{2,value}','"true"')::text),'checked');
   perform pg_temp.expect_error('long text length limit enforced',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{3,value}',to_jsonb(repeat('x',4001)))::text),'text');
   perform pg_temp.expect_error('multiple choice must be array',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{4,value}','"A"')::text),'multiple choice');
   perform pg_temp.expect_error('multiple choice duplicate options rejected',format('select public.submit_activity_registration(%s,%L::jsonb)',ev,jsonb_set(answers,'{4,value}','["A","A"]')::text),'unique');
  end if;
  r:=public.submit_activity_registration(ev,answers);
  perform pg_temp.assert_ok('join state for activity '||ev,r.status=case when ev in(free_direct,b_event) then 'approved' when ev=paid_direct then 'payment_required' else 'pending' end);
  perform pg_temp.assert_ok('answers persist for activity '||ev,jsonb_array_length(public.get_activity_registration_form(ev)->'answers')=5);
 end loop;
 perform pg_temp.expect_error('paid approval cannot prepare before host decision',format('select public.prepare_activity_payment(%s)',paid_approval),'approval');
 select count(*) into count_before from public.tbl_activity_registration_answers where event_id=free_direct;
 perform pg_temp.assert_ok('participant can read own answers',count_before=5);
 perform pg_temp.expect_error('participant cannot directly update answers',format('update public.tbl_activity_registration_answers set value=''"tamper"'' where event_id=%s',free_direct),'permission');
 perform pg_temp.expect_error('client cannot fabricate paid state','update public.tbl_activity_payments set status=''paid''','permission');
 perform pg_temp.expect_error('client cannot change platform fee','update public.tbl_activity_payments set platform_fee_bps=0','permission');
 r:=public.submit_activity_registration(paid_direct,'[]');
 perform pg_temp.assert_ok('retry preserves locked answers and payment state',r.status='payment_required' and jsonb_array_length(public.get_activity_registration_form(paid_direct)->'answers')=5);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[1],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_ok('host sees submitted registration responses',jsonb_array_length(public.get_partner_registrations(free_direct)->0->'answers')=5);
 perform pg_temp.assert_ok('host response excludes unsolicited contacts',not ((public.get_partner_registrations(free_direct)->0)?|array['email','phone','phonenumber','phone_e164']));
 perform pg_temp.expect_error('form locked after participant submission',format('select public.save_activity_registration_questions(%s,''[]'')',free_direct),'locked');
 r:=public.respond_activity_join(free_approval,participant,'approved');
 perform pg_temp.assert_ok('free approval completes',r.status='approved');
 r:=public.respond_activity_join(paid_approval,participant,'approved');
 perform pg_temp.assert_ok('paid approval still requires verified payment',r.status='payment_required');
 perform pg_temp.assert_ok('partner A cannot select partner B answers',(select count(*) from public.tbl_activity_registration_answers where event_id=b_event)=0);
 perform pg_temp.expect_error('partner A cannot call partner B registration RPC',format('select public.get_partner_registrations(%s)',b_event),'ownership');
 dashboard:=public.get_partner_dashboard();
 perform pg_temp.assert_ok('partner A dashboard excludes partner B earnings/activity',not exists(select 1 from jsonb_array_elements(dashboard->'activities') x where (x->>'event_id')::integer=b_event));
 perform pg_temp.assert_ok('unpaid registrations excluded from gross',(dashboard->'summary'->>'gross_paisa')::bigint=expected_gross);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[2],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_ok('partner B cannot select participant answers of A',(select count(*) from public.tbl_activity_registration_answers where event_id=free_direct)=0);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_ids[3],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 execute 'set local role authenticated';
 payment:=public.prepare_activity_payment(paid_approval);
 perform pg_temp.assert_ok('approved paid request can create pending order',payment.status='created' and payment.amount_paisa=1000 and payment.platform_fee_paisa is null);
 perform pg_temp.assert_ok('payment prepare idempotency',(public.prepare_activity_payment(paid_approval)).id=payment.id);
 payment:=public.prepare_activity_payment(paid_direct);
 perform pg_temp.assert_ok('paid direct can prepare only unconfirmed order',payment.status='created' and payment.amount_paisa=1000 and payment.platform_fee_bps is null);
 perform pg_temp.assert_ok('payment preparation retains saved answers',jsonb_array_length(public.get_activity_registration_form(paid_approval)->'answers')=5);
 execute 'reset role';
 update public.tbl_users set is_active=0 where id=participant;
 execute 'set local role authenticated';
 perform pg_temp.expect_error('inactive participant cannot load registration form',format('select public.get_activity_registration_form(%s)',free_direct),'unavailable');
 perform pg_temp.expect_error('inactive participant cannot submit registration',format('select public.submit_activity_registration(%s,''[]'')',free_direct),'access');
 perform pg_temp.assert_ok('inactive participant cannot select own answers',(select count(*) from public.tbl_activity_registration_answers where event_id=free_direct and user_id=participant)=0);
 perform pg_temp.assert_ok('inactive participant cannot select questions',(select count(*) from public.tbl_activity_registration_questions where event_id=free_direct)=0);
 execute 'reset role';
 update public.tbl_users set is_active=1 where id=participant;
 perform set_config('request.jwt.claims','{}',true);
 execute 'set local role anon';
 begin perform public.get_partner_dashboard(); raise exception 'Anonymous RPC unexpectedly permitted'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform pg_temp.assert_ok('anonymous RPC access denied',true);
end $$;
select count(*) as passed_assertions, bool_and(passed) as all_passed, jsonb_agg(label order by label) as checks from phase1_assertions;
rollback;
