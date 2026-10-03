import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-invite-lifecycle-'));let started=false;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55451','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55451`,'-w','start']);started=true;
 const guard=fs.readFileSync('supabase/migrations/20260930192948_enforce_ended_activity_mutation_guards.sql','utf8').split('CREATE OR REPLACE FUNCTION public.request_join_activity')[0];
 sql(`create role anon;create role authenticated;create schema auth;create schema private;create schema extensions;create extension pgcrypto schema extensions;
 create function auth.uid() returns uuid language sql as $$select ('00000000-0000-0000-0000-'||lpad(current_setting('qa.user'),12,'0'))::uuid$$;
 create function public.get_current_app_user_id() returns int language sql as $$select current_setting('qa.user')::int$$;
 create table public.tbl_events(id int primary key,created_by int default 1,status text default 'published',is_deleted bool default false,is_cancelled bool default false,event_end_time timestamptz default now()+interval '2 days',registration_close_time timestamptz default now()+interval '1 day',max_participants int default 10,is_paid bool default false,payment_collection_mode text default 'onsite',join_type text default 'approval');
 create table public.tbl_activity_invites(id bigint generated always as identity,event_id int,token_hash text,created_by int,expires_at timestamptz,max_uses int,uses_count int default 0,revoked_at timestamptz);
 create table public.tbl_event_participants(id bigint generated always as identity,event_id int,user_id int,status text,invited_by int,responded_at timestamptz,joined_at timestamptz,unique(event_id,user_id));
 create function private.can_manage_activity(int,int) returns bool language sql as $$select exists(select 1 from public.tbl_events where id=$1 and created_by=$2)$$;
 create function private.activity_occupied_count(int,int) returns int language sql as $$select count(*)::int from public.tbl_event_participants where event_id=$1 and user_id<>$2 and status in('approved','going','payment_required')$$;
 ${guard}
 ${fs.readFileSync('scripts/fixtures/activity-invite-functions.sql','utf8')}
 ${fs.readFileSync('supabase/migrations/20261003082845_activity_invite_lifecycle_guard.sql','utf8')}
 insert into public.tbl_events(id) select n from generate_series(1,12)n;
 grant execute on function public.create_activity_invite(int,timestamptz,int),public.redeem_activity_invite(text) to authenticated;
 `);
 let checks=0;const as=(u,q)=>sql(`set role authenticated;select set_config('qa.user','${u}',false);${q}`).split('\n').at(-1);
 const token=e=>as(1,`select public.create_activity_invite(${e})->>'token';`);
 const redeem=(u,t)=>as(u,`select public.redeem_activity_invite('${t}')->>'status';`);
 const eq=(actual,expected)=>{assert.equal(actual,expected);checks++;};
 for(const [i,change,reason] of [[1,"event_end_time=now()-interval '1 second'",/ended/],[2,"is_cancelled=true",/unavailable/],[3,"is_deleted=true",/unavailable/],[4,"status='completed'",/ended|unavailable/],[5,"registration_close_time=now()-interval '1 second'",/Registration is closed/]]){
  const t=token(i);sql(`update public.tbl_events set ${change} where id=${i}`);
  assert.throws(()=>token(i),reason);checks++;assert.throws(()=>redeem(2,t),reason);checks++;
  eq(sql(`select uses_count from public.tbl_activity_invites where event_id=${i}`),'0');eq(sql(`select count(*) from public.tbl_event_participants where event_id=${i}`),'0');
 }
 const free=token(6);eq(redeem(2,free),'approved');eq(redeem(2,free),'approved');eq(sql('select uses_count from public.tbl_activity_invites where event_id=6'),'1');
 sql("update public.tbl_event_participants set status='left',joined_at=null where event_id=6;");const fresh=token(6);eq(redeem(2,fresh),'approved');
 sql("update public.tbl_events set is_paid=true,payment_collection_mode='cashfree' where id=7;");const paid=token(7);eq(redeem(2,paid),'payment_required');eq(sql("select count(*) from public.tbl_event_participants where event_id=7 and joined_at is not null"),'0');eq(redeem(2,paid),'payment_required');eq(sql('select uses_count from public.tbl_activity_invites where event_id=7'),'1');
 sql("update public.tbl_events set is_paid=true,payment_collection_mode='onsite' where id=8;");eq(redeem(2,token(8)),'approved');
 assert.throws(()=>as(2,'select public.create_activity_invite(9);'),/Only a host or co-host/);checks++;
 const expires=token(10);sql("update public.tbl_activity_invites set expires_at=now()-interval '1 second' where event_id=10;");assert.throws(()=>redeem(2,expires),/invalid or expired/);checks++;
 // Real payment finalization regression suite separately verifies late provider
 // success queues REFUND_REQUIRED and never admits. This suite cannot issue payment.
 console.log(JSON.stringify({status:'PASS',checks,scope:'Actual PostgreSQL invitation functions and lifecycle guards: ended/cancelled/deleted/completed/closed denial without token consumption, free Host approval, private fresh-invite rejoin, Cashfree payment-required without seat, replay and expiry'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
