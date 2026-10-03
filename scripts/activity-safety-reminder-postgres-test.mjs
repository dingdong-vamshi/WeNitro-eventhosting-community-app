import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync,spawn} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-safety-reminder-'));let started=false;let checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const args=['-h',dir,'-p','55454','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];const sql=q=>run('psql',args,q).trim();
const sqlAsync=q=>new Promise((resolve,reject)=>{const p=spawn('psql',args);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(q);});
const eq=(a,b)=>{assert.equal(a,b);checks++;};const count=()=>sql('select count(*) from public.tbl_notifications');
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55454`,'-w','start']);started=true;
 const baseline=fs.readFileSync('supabase/migrations/20260902140616_completion_bridge_baseline.sql','utf8');
 const enqueue=baseline.slice(baseline.indexOf('create or replace function private.enqueue_notification('),baseline.indexOf('create or replace function private.notify_activity_comment()'));
 const migration=fs.readFileSync('supabase/migrations/20261003181703_activity_safety_reminders.sql','utf8');
 sql(`create role anon;create role authenticated;create schema private;create schema auth;
 create table auth.users(id uuid primary key,banned_until timestamptz);
 create table public.tbl_users(id int primary key,auth_user_id uuid,is_active int default 1,is_delete int default 0,deactivated_at timestamptz);
 create table public.tbl_events(id int primary key,created_by int,status text default 'published',is_deleted bool default false,is_cancelled bool default false,event_start_time timestamptz default now()+interval '9 minutes',event_end_time timestamptz default now()+interval '2 hours');
 create table public.tbl_event_participants(event_id int,user_id int,status text,primary key(event_id,user_id));
 create table public.tbl_notifications(id bigint generated always as identity,user_id int,sender_id int,type text,title text,body text,reference_id text,data jsonb,is_read bool);
 ${enqueue}
 ${migration.slice(0,migration.indexOf("select cron.schedule("))}
 grant usage on schema private to anon,authenticated;
 insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,20)n;
 insert into public.tbl_users(id,auth_user_id) select n,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,20)n;
 insert into public.tbl_events(id,created_by) values(1,1);
 insert into public.tbl_event_participants values(1,1,'approved'),(1,2,'approved'),(1,3,'going'),(1,4,'paid'),(1,5,'left'),(1,6,'pending'),(1,7,'payment_required'),(1,8,'payment_pending'),(1,9,'rejected'),(1,10,'approved_pending_payment'),(1,11,'approved'),(1,12,'approved'),(1,13,'approved'),(1,14,'approved'),(1,15,'approved');
 update public.tbl_users set is_active=0 where id=11;update public.tbl_users set is_delete=1 where id=12;update public.tbl_users set deactivated_at=now() where id=13;update auth.users set banned_until=now()+interval '1 day' where id=(select auth_user_id from public.tbl_users where id=14);delete from auth.users where id=(select auth_user_id from public.tbl_users where id=15);`);
 eq(sql('select private.dispatch_due_activity_safety_reminders()'),'4');eq(count(),'4');eq(sql("select string_agg(user_id::text,',' order by user_id) from public.tbl_notifications"),'1,2,3,4');
 eq(sql('select private.dispatch_due_activity_safety_reminders()'),'0');eq(count(),'4');
 eq(sql("select count(*) from public.tbl_notifications where body='Make sure to share your activity details and live location with someone you trust.' and type='activity_safety_reminder' and data->>'event_id'='1' and sender_id is null"),'4');
 for(const role of ['anon','authenticated']){
  assert.throws(()=>sql(`set role ${role};select private.dispatch_due_activity_safety_reminders()`),/permission denied/);checks++;
  assert.throws(()=>sql(`set role ${role};select * from private.activity_safety_reminder_deliveries`),/permission denied/);checks++;
 }
 // State is evaluated at dispatch, not copied from a stale precomputed audience.
 sql("insert into public.tbl_events(id,created_by) select n,1 from generate_series(2,8)n;update public.tbl_events set is_cancelled=true where id=2;update public.tbl_events set is_deleted=true where id=3;update public.tbl_events set status='completed' where id=4;update public.tbl_events set status='draft' where id=5;update public.tbl_events set event_start_time=now()-interval '1 second' where id=6;update public.tbl_events set event_start_time=now()+interval '11 minutes' where id=7;update public.tbl_events set event_end_time=now()-interval '1 second' where id=8;");
 eq(sql('select private.dispatch_due_activity_safety_reminders()'),'0');eq(count(),'4');
 // Changed start time is a different scheduled occurrence, current left users excluded.
 sql("update public.tbl_events set event_start_time=event_start_time+interval '10 seconds' where id=1;update public.tbl_event_participants set status='left' where event_id=1 and user_id=2;");
 eq(sql('select private.dispatch_due_activity_safety_reminders()'),'3');eq(count(),'7');
 // A late approved join in the ten-minute window still receives exactly one.
 sql("insert into public.tbl_event_participants values(1,16,'approved');");eq(sql('select private.dispatch_due_activity_safety_reminders()'),'1');eq(sql('select private.dispatch_due_activity_safety_reminders()'),'0');
 // Notification failure rolls the delivery ledger back; retry really delivers.
 sql("insert into public.tbl_events(id,created_by) values(9,1);create function public.qa_fail_notice() returns trigger language plpgsql as $$begin if new.reference_id='9' then raise exception 'QA delivery failure';end if;return new;end$$;create trigger qa_fail_notice before insert on public.tbl_notifications for each row execute function public.qa_fail_notice();");
 assert.throws(()=>sql('select private.dispatch_due_activity_safety_reminders()'),/QA delivery failure/);checks++;
 eq(sql('select count(*) from private.activity_safety_reminder_deliveries where event_id=9'),'0');sql('drop trigger qa_fail_notice on public.tbl_notifications;');eq(sql('select private.dispatch_due_activity_safety_reminders()'),'1');
 // Batch bound and parallel workers cannot duplicate deliveries or starve remaining rows.
 sql("insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(100,1100)n;insert into public.tbl_users(id,auth_user_id) select n,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(100,1100)n;insert into public.tbl_events(id,created_by) values(10,1);insert into public.tbl_event_participants select 10,n,'approved' from generate_series(100,1100)n;");
 eq(sql('select private.dispatch_due_activity_safety_reminders()'),'1000');
 const concurrent=await Promise.all([sqlAsync('select private.dispatch_due_activity_safety_reminders()'),sqlAsync('select private.dispatch_due_activity_safety_reminders()')]);eq(concurrent.reduce((a,b)=>a+Number(b),0),2);
 eq(sql("select count(*) from public.tbl_notifications where reference_id='10'"),'1002');eq(sql("select count(*)-count(distinct user_id) from public.tbl_notifications where reference_id='10'"),'0');
 // Actual clock boundary: no early send, then due, then no duplicate.
 sql("insert into public.tbl_events(id,created_by,event_start_time) values(11,1,now()+interval '10 minutes 2 seconds');");eq(sql('select private.dispatch_due_activity_safety_reminders()'),'0');await new Promise(resolve=>setTimeout(resolve,2300));eq(sql('select private.dispatch_due_activity_safety_reminders()'),'1');eq(sql('select private.dispatch_due_activity_safety_reminders()'),'0');
 assert.match(migration,/cron.schedule\('wenitro-activity-safety-reminders','\* \* \* \* \*'/);checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real PostgreSQL exact body, natural due boundary, eligible Host/confirmed audience, excluded states/accounts, lifecycle, reschedule/late join, atomic retry, permission denial, bounded and parallel dispatch. Cron registration checked locally; deployed cron execution pending.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
