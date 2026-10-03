import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-participant-management-'));let started=false,checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};const sql=q=>run('psql',['-h',dir,'-p','55455','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const old=fs.readFileSync('supabase/migrations/20260930192948_enforce_ended_activity_mutation_guards.sql','utf8'),start=old.indexOf('CREATE OR REPLACE FUNCTION public.respond_activity_join'),end=old.indexOf('CREATE OR REPLACE FUNCTION public.set_activity_cohost');
const migration=fs.readFileSync('supabase/migrations/20261003182405_participant_management_boundaries.sql','utf8');
const response=(actor,event,user,status)=>sql(`set role authenticated;select set_config('qa.user','${actor}',false);select (public.respond_activity_join(${event},${user},'${status}')).status;`).split('\n').at(-1);
const eq=(a,b)=>{assert.equal(a,b);checks++;};const deny=(actor,event,user,status,reason)=>{assert.throws(()=>response(actor,event,user,status),reason);checks++;};
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55455`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select ('00000000-0000-0000-0000-'||lpad(current_setting('qa.user'),12,'0'))::uuid$$;
 create function public.get_current_app_user_id() returns int language sql as $$select current_setting('qa.user')::int$$;
 create table public.tbl_events(id int primary key,created_by int default 1,status text default 'published',is_deleted bool default false,is_cancelled bool default false,event_end_time timestamptz default now()+interval '1 day',is_paid bool default false,payment_collection_mode text default 'onsite',max_participants int default 10);
 create table public.tbl_event_participants(id bigint generated always as identity,event_id int,user_id int,status text,role text default 'participant',joined_at timestamptz,responded_at timestamptz,unique(event_id,user_id));
 create table public.tbl_activity_payments(event_id int,user_id int,status text,financial_status text,provider_status text,updated_at timestamptz);
 create table public.qa_notifications(user_id int,body text);
 create function private.can_manage_activity(int,int) returns bool language sql as $$select exists(select 1 from public.tbl_events e where e.id=$1 and (e.created_by=$2 or exists(select 1 from public.tbl_event_participants p where p.event_id=e.id and p.user_id=$2 and p.role='cohost' and p.status in ('approved','going','paid'))))$$;
 create function private.activity_occupied_count(int,int) returns int language sql as $$select count(*)::int from public.tbl_event_participants where event_id=$1 and user_id<>$2 and status in ('approved','going','paid','payment_required')$$;
 create function private.enqueue_notification(int,text,text,text,text,int,jsonb) returns void language sql as $$insert into public.qa_notifications values($1,$4)$$;
 ${old.split('CREATE OR REPLACE FUNCTION public.request_join_activity')[0]}
 ${old.slice(start,end)}
 insert into public.tbl_events(id) select n from generate_series(1,10)n;
 insert into public.tbl_event_participants(event_id,user_id,status,role) values(1,2,'approved','cohost'),(1,3,'approved','cohost'),(2,2,'approved','participant');
 update public.tbl_events set is_paid=true,payment_collection_mode='cashfree' where id=2;
 insert into public.tbl_activity_payments values(2,2,'paid','PAYABLE',null,null);`);
 // Reproduce both regressions with the exact prior/deployed RPC definition.
 eq(response(2,1,3,'rejected'),'rejected');eq(response(1,2,2,'approved'),'payment_required');
 sql(`update public.tbl_event_participants set status='approved';truncate public.qa_notifications;${migration.slice(0,migration.indexOf('-- Keep late payment'))}`);
 deny(2,1,3,'rejected',/Co-host role/);deny(1,1,3,'rejected',/Co-host role/);deny(2,1,2,'rejected',/own participation/);deny(2,1,1,'rejected',/original Host/);deny(9,1,3,'rejected',/Only a host/);
 eq(sql("select count(*) from public.tbl_event_participants where event_id=1 and status='approved'"),'2');eq(sql('select count(*) from public.qa_notifications'),'0');
 sql("insert into public.tbl_event_participants(event_id,user_id,status) values(1,4,'pending');");
 eq(response(2,1,4,'approved'),'approved');eq(response(2,1,4,'approved'),'approved');eq(sql('select count(*) from public.qa_notifications'),'1');
 eq(response(2,1,4,'rejected'),'rejected');eq(response(2,1,4,'rejected'),'rejected');eq(sql('select count(*) from public.qa_notifications'),'2');
 sql("update public.tbl_event_participants set role='participant' where event_id=1 and user_id=3;");eq(response(2,1,3,'rejected'),'rejected');
 // Demotion immediately revokes the actor's management capability.
 sql("update public.tbl_event_participants set role='participant' where event_id=1 and user_id=2;");deny(2,1,4,'approved',/Only a host/);
 for(const financial of ['PAYABLE','ON_HOLD','SETTLED']){
  sql(`update public.tbl_activity_payments set financial_status='${financial}' where event_id=2;`);eq(response(1,2,2,'approved'),'approved');deny(1,2,2,'rejected',/payment review/);deny(1,2,2,'waitlist',/payment review/);
 }
 for(const financial of ['REFUND_REQUIRED','DISPUTED']){sql(`update public.tbl_activity_payments set financial_status='${financial}' where event_id=2;`);deny(1,2,2,'approved',/payment review/);}
 eq(sql("select status from public.tbl_event_participants where event_id=2 and user_id=2"),'approved');
 sql("insert into public.tbl_event_participants(event_id,user_id,status) values(3,4,'payment_required');insert into public.tbl_activity_payments values(3,4,'pending','OPEN',null,null);update public.tbl_events set is_paid=true,payment_collection_mode='cashfree' where id=3;");
 eq(response(1,3,4,'rejected'),'rejected');eq(sql("select status||':'||provider_status from public.tbl_activity_payments where event_id=3"),'cancelled:HOST_REJECTED');
 sql("update public.tbl_event_participants set status='payment_required' where event_id=3;update public.tbl_activity_payments set status='pending' where event_id=3;");eq(response(1,3,4,'waitlist'),'pending');eq(sql("select status||':'||provider_status from public.tbl_activity_payments where event_id=3"),'cancelled:HOST_WAITLISTED');
 eq(response(1,3,4,'approved'),'payment_required');
 for(const [event,change] of [[4,"status='completed'"],[5,"event_end_time=now()-interval '1 second'"],[6,'is_cancelled=true'],[7,'is_deleted=true']]){
  sql(`insert into public.tbl_event_participants(event_id,user_id,status) values(${event},4,'approved');update public.tbl_events set ${change} where id=${event};`);deny(1,event,4,'rejected',/ended|unavailable/);eq(sql(`select status from public.tbl_event_participants where event_id=${event}`),'approved');
 }
 console.log(JSON.stringify({status:'PASS',checks,scope:'Actual deployed prior RPC reproduces Co-host removal and paid approval downgrade; replacement protects Host/Co-host/self, current management authority, paid retry/review, unpaid reservation cancellation, idempotent notices, ended/cancelled/deleted removal. No remote writes.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
