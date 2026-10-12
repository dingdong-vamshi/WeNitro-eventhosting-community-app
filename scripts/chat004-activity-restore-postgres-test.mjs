import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawnSync}from'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wn-restore-'));let started=false,checks=0;
const run=(c,a,input)=>{const r=spawnSync(c,a,{input,encoding:'utf8'});if(r.status||r.error)throw Error(r.stderr||r.error);return r.stdout.trim();};
const sql=q=>run('psql',['-h',dir,'-p','55476','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q);
try{run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55476`,'-w','start']);started=true;
sql(`create schema private;create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.is_wenitro_admin() returns boolean language sql as $$select coalesce(current_setting('qa.admin',true),'true')::boolean$$;
create function public.current_app_user_id() returns int language sql as $$select 1$$;
create table public.tbl_events(id int primary key,title text,created_by int,is_deleted boolean default false,is_cancelled boolean default false,status text default 'published',admin_moderation_status text default 'active',admin_moderation_reason text,admin_moderated_at timestamptz,admin_moderated_by uuid,is_admin_pinned boolean,updated_at timestamptz);
create table public.tbl_activity_payments(event_id int,status text);
create table public.tbl_event_participants(event_id int,user_id int,status text);
create table public.tbl_notifications(user_id int,sender_id int,type text,reference_id text,title text,body text,data jsonb);
create table private.admin_operation_audit(actor_id uuid,target_type text,target_id int,action text,reason text,previous_state jsonb,next_state jsonb,created_at timestamptz default now());
insert into public.tbl_events(id,title,created_by,status,is_cancelled) values(1,'QA',1,'cancelled',true);`);
const old=fs.readFileSync('supabase/migrations/20261009133000_admin_content_controls.sql','utf8');sql(old.slice(old.indexOf('create or replace function public.admin_moderate_activity('),old.indexOf('create or replace function public.admin_moderate_content(')));
sql("select public.admin_moderate_activity(1,'restore_event','QA baseline');");assert.equal(sql('select status from public.tbl_events where id=1;'),'cancelled');checks++;
sql(fs.readFileSync('supabase/migrations/20261012062332_chat004_activity_restore_status.sql','utf8'));
sql("select public.admin_moderate_activity(1,'restore_event','QA fixed');");assert.equal(sql("select status||':'||is_cancelled from public.tbl_events where id=1;"),'published:false');checks++;
assert.equal(sql("select public.admin_moderate_activity(1,'restore_event','QA idempotent')->>'changed';"),'false');checks++;
assert.equal(sql("select count(*) from private.admin_operation_audit where previous_state->>'status'='cancelled' and next_state->>'status'='published';"),'1');checks++;
for(const status of ['draft','completed','published']){sql(`update public.tbl_events set status='${status}',is_deleted=true where id=1;select public.admin_moderate_activity(1,'restore_event','QA preserved');`);assert.equal(sql('select status from public.tbl_events where id=1;'),status);checks++;}
sql("insert into public.tbl_activity_payments values(1,'paid');update public.tbl_events set is_cancelled=true,status='cancelled' where id=1;");assert.throws(()=>sql("select public.admin_moderate_activity(1,'restore_event','QA paid denied');"),/financial reconciliation/);checks++;
assert.throws(()=>sql("set qa.admin='false';select public.admin_moderate_activity(1,'restore_event','QA nonadmin');"),/Administrator access/);checks++;
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual old restore regression reproduced; canceled flag/status restored, status-only inconsistency recovered, draft/completed preserved, audit, idempotence, paid and non-admin denial.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
