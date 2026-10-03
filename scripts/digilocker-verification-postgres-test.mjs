import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawnSync}from'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-digilocker-'));let started=false,checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55464','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};const q=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
const actor1='00000000-0000-4000-8000-000000000001',actor2='00000000-0000-4000-8000-000000000002';
const provider1='11111111-1111-4111-8111-111111111111',provider2='22222222-2222-4222-8222-222222222222';
const call=(actor,action,env=null,id=null,provider=null,status=null,verified=false)=>`select public.aadhaar_session_service(${q(actor)},${q(action)},${q(env)},${q(id)},${q(provider)},${q(status)},${verified},null)`;
const attempt=text=>sql(`select qa_attempt(${q(text)})`);const result=(...args)=>JSON.parse(sql(call(...args))||'null');
const trust=actor=>JSON.parse(sql(`select private.trust_score_for(${actor})`));
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55464`,'-w','start']);started=true;
 sql(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',coalesce(nullif(current_setting('qa.role',true),''),'service_role'))$$;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz);
 create table public.tbl_users(id int primary key,auth_user_id uuid,is_active int default 1,is_delete int default 0,deactivated_at timestamptz,rating numeric default 0,points int default 12,isverified int default 0);
 create table public.tbl_user_verification(user_id int,live_photo_verified bool default false,aadhaar_verified bool default false,phone_verified bool default false,status text,live_photo_path text);
 create table public.tbl_user_social_links(user_id int,instagram text,facebook text,twitter text,linkedin text,youtube text);
 create table public.tbl_event_participants(event_id int,user_id int,status text);
 create table public.tbl_events(id int primary key,is_deleted bool default false,is_cancelled bool default false);
 create function public.get_current_app_user_id() returns int language sql as $$select 1$$;
 create function private.can_read_profile(int) returns bool language sql as $$select $1=1$$;
 create function qa_attempt(q text) returns text language plpgsql as $$begin execute q;return 'ACCEPTED';exception when others then return SQLSTATE;end$$;
 insert into public.tbl_users(id,auth_user_id) values(1,'${actor1}'),(2,'${actor2}');insert into auth.users(id) select auth_user_id from public.tbl_users;
 ${fs.readFileSync('scripts/fixtures/trust-score-functions.sql','utf8')}
 ${fs.readFileSync('supabase/migrations/20261003205431_sandbox_digilocker_verification.sql','utf8')}`);
 eq(sql("select relrowsecurity from pg_class where oid='private.aadhaar_verification_sessions'::regclass"),'t');
 for(const role of ['anon','authenticated']){
  eq(sql(`select has_table_privilege('${role}','private.aadhaar_verification_sessions','SELECT')`),'f');
  eq(sql(`select has_function_privilege('${role}','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE')`),'f');
 }
 eq(sql("select has_function_privilege('service_role','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE')"),'t');
 eq(sql(`select set_config('qa.role','authenticated',false);select qa_attempt(${q(call(actor1,'begin','test'))})`).split('\n').at(-1),'42501');
 eq(result(actor1,'read'),null);eq(trust(1).total,0);
 const test=result(actor1,'begin','test');eq(test.user_id,1);eq(test.consent_version,'wenitro-aadhaar-digilocker-v1');
 eq(attempt(call(actor1,'begin','test')),'P0001');
 eq(attempt(call(actor2,'read',null,test.id)),'42501');
 eq(attempt(call(actor2,'update','test',test.id,provider1,'created')),'42501');
 eq(result(actor1,'update','test',test.id,provider1,'created').status,'created');
 eq(result(actor1,'claim_refresh',null,test.id).provider_session_id,provider1);
 eq(attempt(call(actor1,'claim_refresh',null,test.id)),'P0001');
 eq(attempt(call(actor1,'update','test',test.id,provider2,'succeeded')),'42501');
 eq(attempt(call(actor1,'update','production',test.id,provider1,'succeeded',true)),'42501');
 eq(attempt(call(actor1,'update','test',test.id,provider1,'succeeded',true)),'22023');
 eq(result(actor1,'update','test',test.id,provider1,'succeeded').verified_at,null);eq(trust(1).total,0);
 sql(`update private.aadhaar_verification_sessions set created_at=now()-interval '2 minutes' where id='${test.id}'`);
 const live=result(actor1,'begin','production');
 eq(attempt(call(actor1,'update','production',live.id,provider2,'succeeded',true)),'22023'); // Cannot skip binding provider session.
 result(actor1,'update','production',live.id,provider2,'created');
 eq(attempt(call(actor1,'update','production',live.id,provider2,'created',true)),'22023');
 const saved=result(actor1,'update','production',live.id,provider2,'succeeded',true);assert(saved.verified_at);checks++;
 eq(trust(1).total,20);eq(trust(1).aadhaar_verified,true);eq(trust(2).total,0);
 eq(result(actor1,'update','production',live.id,provider2,'succeeded',true).verified_at,saved.verified_at);eq(trust(1).total,20);
 eq(sql('select points from tbl_users where id=1'),'12');eq(sql('select count(*) from tbl_user_verification'),'0');
 eq(JSON.parse(sql(`select private.sync_verification_rewards('${actor1}')`)).aadhaar_verified,true);
 eq(sql('select isverified from tbl_users where id=1'),'0'); // Other required checks still missing.
 sql(`insert into tbl_user_verification(user_id,status,live_photo_path) values(1,'submitted','private-selfie');`);
 const synced=JSON.parse(sql(`select private.sync_verification_rewards('${actor1}')`));eq(synced.live_photo_pending,true);eq(synced.live_photo_verified,false);eq(sql('select status from tbl_user_verification where user_id=1'),'submitted');
 for(const patch of ["is_active=0","is_delete=1","deactivated_at=now()"]){sql(`update tbl_users set ${patch} where id=1`);eq(attempt(call(actor1,'read')),'42501');sql('update tbl_users set is_active=1,is_delete=0,deactivated_at=null where id=1');}
 sql(`update auth.users set banned_until=now()+interval '1 hour' where id='${actor1}'`);eq(attempt(call(actor1,'read')),'42501');sql('update auth.users set banned_until=null');
 const other=result(actor2,'begin','production');result(actor2,'update','production',other.id,'44444444-4444-4444-8444-444444444444','created');sql(`update private.aadhaar_verification_sessions set expires_at=now()-interval '1 second' where id='${other.id}'`);eq(attempt(call(actor2,'update','production',other.id,'44444444-4444-4444-8444-444444444444','succeeded',true)),'22023');eq(trust(2).total,0);
 eq(sql("select count(*) from information_schema.columns where table_schema='private' and table_name='aadhaar_verification_sessions' and column_name ~ '(number|otp|photo|document|url|address|name)'"),'0');
 sql(`delete from auth.users where id='${actor1}'`);eq(sql('select count(*) from private.aadhaar_verification_sessions where user_id=1'),'0');eq(attempt(call(actor1,'read')),'42501');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real PostgreSQL private session ledger, service-only boundary, current account/Auth gates, owner isolation, provider/environment binding, throttle, consent, test-no-Trust, production+20 once, no Nitro/selfie mutation, expiry, minimal retention and Auth deletion cascade. All provider proofs are local synthetic fixtures only.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
