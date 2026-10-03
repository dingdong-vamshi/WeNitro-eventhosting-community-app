import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-active-join-'));let started=false,checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};const sql=q=>run('psql',['-h',dir,'-p','55456','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const source=fs.readFileSync('supabase/migrations/20260930192948_enforce_ended_activity_mutation_guards.sql','utf8');
const eq=(a,b)=>{assert.equal(a,b);checks++;};const join=(e,status='going',user=2)=>sql(`set role authenticated;select set_config('qa.user','${user}',false);select (public.request_join_activity(${e},'${status}')).status;`).split('\n').at(-1);
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55456`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select case when current_setting('qa.user')<>'0' then ('00000000-0000-0000-0000-'||lpad(current_setting('qa.user'),12,'0'))::uuid end$$;
 create function public.get_current_app_user_id() returns int language sql as $$select nullif(current_setting('qa.user')::int,0)$$;
 create table public.tbl_events(id int primary key,created_by int default 1,status text default 'published',is_deleted bool default false,is_cancelled bool default false,event_end_time timestamptz default now()+interval '1 day',registration_close_time timestamptz default now()+interval '1 hour',is_paid bool default false,payment_collection_mode text default 'onsite',max_participants int default 5,visibility_type text default 'public',join_type text default 'approval');
 create table public.tbl_event_participants(id bigint generated always as identity,event_id int,user_id int,status text,joined_at timestamptz default now(),responded_at timestamptz,unique(event_id,user_id));
 create table public.tbl_activity_payments(event_id int,user_id int,status text,financial_status text,provider_status text,updated_at timestamptz,checkout_expires_at timestamptz);
 create table public.qa_updates(n int);
 create function public.qa_track_update() returns trigger language plpgsql as $$begin insert into public.qa_updates values(1);return new;end$$;
 create trigger qa_track_update after update on public.tbl_event_participants for each row execute function public.qa_track_update();
 create function private.assert_registration_complete(int,int) returns void language plpgsql as $$begin if exists(select 1 from public.tbl_events where id=$1 and visibility_type='private') and not exists(select 1 from public.tbl_event_participants where event_id=$1 and user_id=$2 and status not in ('left','rejected')) then raise exception 'Activity access required' using errcode='42501';end if;end$$;
 create function private.activity_occupied_count(int,int) returns int language sql as $$select count(*)::int from public.tbl_event_participants where event_id=$1 and user_id<>$2 and status in ('approved','going','paid','payment_required')$$;
 ${source.slice(0,source.indexOf('CREATE OR REPLACE FUNCTION public.respond_activity_join'))}
 insert into public.tbl_events(id) select n from generate_series(1,10)n;
 insert into public.tbl_event_participants(event_id,user_id,status) values(1,2,'approved'),(2,2,'approved');
 update public.tbl_events set is_paid=true,payment_collection_mode='cashfree' where id=2;
 insert into public.tbl_activity_payments(event_id,user_id,status,financial_status) values(2,2,'paid','PAYABLE');`);
 eq(join(1),'pending');eq(join(2),'pending'); // Actual prior bug reproduced.
 sql(`update public.tbl_event_participants set status='approved',joined_at=now();truncate public.qa_updates;${fs.readFileSync('supabase/migrations/20261003183320_active_join_retry_idempotency.sql','utf8')}`);
 const before=sql('select jsonb_agg(to_jsonb(p) order by id) from public.tbl_event_participants p');
 for(const status of ['going','interested','waitlist']){eq(join(1,status),'approved');eq(join(2,status),'approved');}
 eq(sql('select jsonb_agg(to_jsonb(p) order by id) from public.tbl_event_participants p'),before);eq(sql('select count(*) from public.qa_updates'),'0');
 sql('update public.tbl_events set max_participants=0 where id=1');eq(join(1),'approved');sql('update public.tbl_events set max_participants=5 where id=1');
 eq(join(1,'left'),'left');eq(join(1),'pending');eq(sql('select count(*) from public.tbl_event_participants where event_id=1'),'1');
 sql("update public.tbl_event_participants set status='rejected' where event_id=1;");eq(join(1),'pending');
 for(const status of ['payment_required','payment_pending','approved_pending_payment']){sql(`update public.tbl_event_participants set status='${status}' where event_id=1;`);eq(join(1),status);}
 for(const financial of ['PAYABLE','SETTLED','ON_HOLD']){sql(`update public.tbl_activity_payments set financial_status='${financial}' where event_id=2;`);eq(join(2),'approved');}
 for(const financial of ['REFUND_REQUIRED','DISPUTED','REFUNDED','REVERSED']){sql(`update public.tbl_activity_payments set financial_status='${financial}' where event_id=2;`);assert.throws(()=>join(2),/payment needs review|Verified payment/);checks++;}
 sql("delete from public.tbl_activity_payments where event_id=2;");assert.throws(()=>join(2),/Verified payment/);checks++;
 sql("insert into public.tbl_event_participants(event_id,user_id,status) values(3,2,'approved');update public.tbl_events set visibility_type='private' where id=3;");eq(join(3),'approved');eq(join(3,'left'),'left');assert.throws(()=>join(3),/Activity access required/);checks++;
 for(const [e,change] of [[4,"status='completed'"],[5,"event_end_time=now()-interval '1 second'"],[6,'is_deleted=true'],[7,'is_cancelled=true'],[8,"registration_close_time=now()-interval '1 second'"]]){
  sql(`insert into public.tbl_event_participants(event_id,user_id,status) values(${e},2,'approved');update public.tbl_events set ${change} where id=${e};`);assert.throws(()=>join(e),/ended|unavailable|closed/);checks++;
 }
 assert.throws(()=>join(1,'going',0),/Authentication/);checks++;assert.throws(()=>join(1,'bad-status'),/Invalid participation/);checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real prior join RPC reproduces approved/paid downgrade; actual migration preserves active rows/timestamps without notices/capacity recheck, verifies paid state, keeps leave/rejected reapproval/private visibility and lifecycle/auth guards'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
