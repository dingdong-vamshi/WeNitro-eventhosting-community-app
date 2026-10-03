import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-invited-answers-'));let started=false;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55453','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55453`,'-w','start']);started=true;
 const guard=fs.readFileSync('supabase/migrations/20260930192948_enforce_ended_activity_mutation_guards.sql','utf8').split('CREATE OR REPLACE FUNCTION public.request_join_activity')[0];
 sql(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select ('00000000-0000-0000-0000-'||lpad(current_setting('qa.user'),12,'0'))::uuid$$;
 create function public.get_current_app_user_id() returns int language sql as $$select current_setting('qa.user')::int$$;
 create table public.tbl_events(id int primary key,status text default 'published',is_deleted bool default false,is_cancelled bool default false,event_end_time timestamptz default now()+interval '2 days',registration_close_time timestamptz default now()+interval '1 day');
 create table public.tbl_event_participants(event_id int,user_id int,status text,primary key(event_id,user_id));
 create table public.tbl_activity_registration_questions(id int primary key,event_id int,type text,label text,required bool,display_order int,options jsonb default '[]');
 create table public.tbl_activity_registration_answers(event_id int,question_id int,user_id int,value jsonb,primary key(question_id,user_id));
 create function private.registration_event_visible(int) returns bool language sql as $$select current_setting('qa.user')::int<>99$$;
 create function public.request_join_activity(p_event_id int,p_status text) returns public.tbl_event_participants language plpgsql as $$declare r public.tbl_event_participants;begin insert into public.tbl_event_participants values(p_event_id,public.get_current_app_user_id(),'pending') on conflict(event_id,user_id) do update set status='pending' returning * into r;return r;end$$;
 ${guard}
 ${fs.readFileSync('supabase/migrations/20261003181143_invited_registration_answers.sql','utf8')}
 grant usage on schema private to authenticated;grant execute on all functions in schema private to authenticated;
 insert into public.tbl_events(id) select n from generate_series(1,12)n;
 insert into public.tbl_activity_registration_questions(id,event_id,type,label,required,display_order) select n,n,'short_text','Entry name',true,0 from generate_series(1,12)n;
 insert into public.tbl_event_participants values(1,2,'payment_required'),(2,2,'approved'),(3,2,'going'),(4,2,'paid'),(5,2,'payment_required'),(6,2,'payment_required'),(7,2,'payment_required');`);
 let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++;};
 const submit=(e,answers,user=2)=>sql(`set role authenticated;select set_config('qa.user','${user}',false);select (private.submit_activity_registration(${e},'${JSON.stringify(answers)}'::jsonb)).status;`).split('\n').at(-1);
 for(const [e,status] of [[1,'payment_required'],[2,'approved'],[3,'going'],[4,'paid']]){
  assert.throws(()=>submit(e,[]),/Required answer missing/);checks++;
  eq(sql(`select count(*) from public.tbl_activity_registration_answers where event_id=${e}`),'0');
  eq(submit(e,[{question_id:e,value:'  Buyer  '}]),status);
  eq(sql(`select value#>>'{}' from public.tbl_activity_registration_answers where event_id=${e}`),'Buyer');
  eq(submit(e,[{question_id:e,value:'Changed'}]),status);
  eq(sql(`select value#>>'{}' from public.tbl_activity_registration_answers where event_id=${e}`),'Buyer');
 }
 for(const [e,change,reason] of [[5,"event_end_time=now()-interval '1 second'",/ended/],[6,"registration_close_time=now()-interval '1 second'",/closed/],[7,'is_cancelled=true',/unavailable/]]){
  sql(`update public.tbl_events set ${change} where id=${e}`);assert.throws(()=>submit(e,[{question_id:e,value:'Buyer'}]),reason);checks++;
  eq(sql(`select count(*) from public.tbl_activity_registration_answers where event_id=${e}`),'0');eq(sql(`select status from public.tbl_event_participants where event_id=${e}`),'payment_required');
 }
 eq(submit(8,[{question_id:8,value:'New attendee'}]),'pending');
 assert.throws(()=>submit(9,[{question_id:9,value:'Outsider'}],99),/Activity access required/);checks++;
 assert.throws(()=>submit(9,[{question_id:9,value:'   '}]),/Invalid text/);checks++;
 assert.throws(()=>submit(9,[{question_id:9,value:'A'},{question_id:9,value:'B'}]),/Duplicate/);checks++;
 assert.throws(()=>submit(9,[{question_id:100,value:'Unknown'}]),/unknown question/);checks++;
 eq(sql('select count(*) from public.tbl_activity_registration_answers where event_id=9'),'0');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real PostgreSQL replacement RPC: invitation initial required answers, authorization preserved, immutable retry, lifecycle/access/validation guards and rollback; normal self-join remains pending'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
